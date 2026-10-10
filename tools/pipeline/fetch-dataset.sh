#!/usr/bin/env bash
# Fetch the CanCLID zoengjyutgaai parquet shards and verify them.
#
# The 2.5 GB source dataset is deliberately not in git: GitHub refuses files
# over 100 MB, and an LFS copy would charge every clone a 2.5 GB download. This
# script is the reproducible acquisition path — it downloads the five shards
# from the dataset repo, checks each one against tools/pipeline/dataset.sha256,
# and leaves them where tools/pipeline/extract.py expects to find them.
#
# Nothing here talks to a cloud account; it is a plain HTTPS GET plus a hash.
#
# The manifest was checked against revision 829b307 of the dataset repo
# (2026-02-05): all five published LFS sha256 equal the local copies, so main
# still carries exactly this content. If the dataset is ever re-published,
# refresh tools/pipeline/dataset.sha256 in the same commit as any pipeline
# change that depends on it.
#
# Mainland China, where huggingface.co is often unreachable:
#   HF_ENDPOINT=https://hf-mirror.com tools/pipeline/fetch-dataset.sh
#
# Optional env: HF_ENDPOINT (default https://huggingface.co)
#               HF_REVISION (default main — pin a commit sha for a frozen copy)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPO_PATH="datasets/CanCLID/zoengjyutgaai"
# The shards live in the repo's data/ directory; extract.py expects them flat
# under --src, so they land in DEST without that prefix.
REPO_DIR="data"
ENDPOINT="${HF_ENDPOINT:-https://huggingface.co}"
REVISION="${HF_REVISION:-main}"
DEST="${ROOT}/CanCLID/zoengjyutgaai"
MANIFEST="${ROOT}/tools/pipeline/dataset.sha256"
CHECK_ONLY=0
FORCE=0

usage() {
  cat <<USAGE
用法: tools/pipeline/fetch-dataset.sh [选项]

下载 ${REPO_PATH} 的 ${REPO_DIR}/ 下 parquet 分片并按 sha256 校验。已存在且校验通过的分片会跳过，
所以中断后重跑只补缺失的部分。

选项:
  --check        只校验本地文件，不下载（缺文件或校验不符则非零退出）
  --force        忽略本地文件，全部重新下载
  --dest DIR     目标目录（默认 ${DEST#"${ROOT}/"}）
  --endpoint URL Hugging Face 端点（默认 \$HF_ENDPOINT 或 ${ENDPOINT}）
  --revision REV 分支或 commit（默认 \$HF_REVISION 或 ${REVISION}）
  --manifest F   校验和清单（默认 tools/pipeline/dataset.sha256）
  -h, --help     显示本帮助

校验和清单格式与 sha256sum 一致（"<sha256>  <文件名>"），也可以直接用它跑
sha256sum -c。总下载量约 2.5 GB。
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --force) FORCE=1 ;;
    --dest) DEST="${2:?--dest needs a directory}"; shift ;;
    --endpoint) ENDPOINT="${2:?--endpoint needs a URL}"; shift ;;
    --revision) REVISION="${2:?--revision needs a branch or commit}"; shift ;;
    --manifest) MANIFEST="${2:?--manifest needs a file}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[[ -f "${MANIFEST}" ]] || { echo "missing manifest: ${MANIFEST}" >&2; exit 1; }
[[ -s "${MANIFEST}" ]] || { echo "empty manifest: ${MANIFEST}" >&2; exit 1; }
ENDPOINT="${ENDPOINT%/}"

if command -v sha256sum >/dev/null 2>&1; then
  sha256_of() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo "need sha256sum or shasum to verify downloads" >&2
  exit 1
fi

# Read "<sha256>  <name>" lines into parallel arrays; the manifest is the only
# list of shards, so an entry missing from it is simply never fetched.
NAMES=()
SUMS=()
while read -r sum name _rest; do
  [[ -n "${sum}" && -n "${name}" ]] || continue
  NAMES+=("$(basename "${name}")")
  SUMS+=("${sum}")
done < "${MANIFEST}"

[[ ${#NAMES[@]} -gt 0 ]] || { echo "manifest lists no files: ${MANIFEST}" >&2; exit 1; }

verify_one() { # <path> <expected-sha>
  local actual
  actual="$(sha256_of "$1")"
  [[ "${actual}" == "$2" ]]
}

fetch() { # <url> <out>
  local url="$1" out="$2" rc=0
  # -f turns an HTTP error page into a failure instead of writing it to disk as
  # if it were a shard; --retry absorbs transient connection drops.
  if [[ -s "${out}" ]]; then
    curl -fL --retry 3 --retry-delay 2 -C - -o "${out}" "${url}" && return 0
    rc=$?
    # 33 = the server ignores Range, so this partial can never be resumed and
    # every re-run would fail the same way. Start that one over from scratch.
    [[ ${rc} -eq 33 ]] || return ${rc}
    echo "==> server refuses byte ranges; restarting this shard from zero" >&2
    rm -f "${out}"
  fi
  curl -fL --retry 3 --retry-delay 2 -o "${out}" "${url}"
}

if [[ ${CHECK_ONLY} -eq 1 ]]; then
  failed=0
  for i in "${!NAMES[@]}"; do
    path="${DEST}/${NAMES[$i]}"
    if [[ ! -f "${path}" ]]; then
      echo "MISSING  ${NAMES[$i]}"
      failed=$((failed + 1))
    elif verify_one "${path}" "${SUMS[$i]}"; then
      echo "ok       ${NAMES[$i]}"
    else
      echo "CORRUPT  ${NAMES[$i]} (sha256 mismatch)"
      failed=$((failed + 1))
    fi
  done
  if [[ ${failed} -gt 0 ]]; then
    echo "==> ${failed}/${#NAMES[@]} shard(s) unusable; run without --check to fetch them" >&2
    exit 1
  fi
  echo "==> all ${#NAMES[@]} shards verified under ${DEST}"
  exit 0
fi

command -v curl >/dev/null 2>&1 || { echo "curl not found" >&2; exit 1; }
mkdir -p "${DEST}"

echo "==> endpoint ${ENDPOINT}/${REPO_PATH}@${REVISION}"
echo "==> dest     ${DEST}"

fetched=0
skipped=0
for i in "${!NAMES[@]}"; do
  name="${NAMES[$i]}"
  want="${SUMS[$i]}"
  path="${DEST}/${name}"
  partial="${path}.part"

  if [[ ${FORCE} -eq 0 && -f "${path}" ]] && verify_one "${path}" "${want}"; then
    echo "==> [$((i + 1))/${#NAMES[@]}] ${name}: already present and verified"
    skipped=$((skipped + 1))
    continue
  fi

  url="${ENDPOINT}/${REPO_PATH}/resolve/${REVISION}/${REPO_DIR}/${name}"
  echo "==> [$((i + 1))/${#NAMES[@]}] ${name}: downloading"
  if ! fetch "${url}" "${partial}"; then
    echo "download failed: ${url}" >&2
    if [[ -s "${partial}" ]]; then
      echo "kept ${partial#"${ROOT}/"} so a re-run can resume it" >&2
    fi
    exit 1
  fi

  if ! verify_one "${partial}" "${want}"; then
    echo "sha256 mismatch for ${name}:" >&2
    echo "  expected ${want}" >&2
    echo "  actual   $(sha256_of "${partial}")" >&2
    # Remove it: resuming a full-length but wrong file can only fail again.
    rm -f "${partial}"
    echo "removed the bad copy; re-run to fetch this shard again" >&2
    exit 1
  fi

  mv "${partial}" "${path}"
  echo "==> [$((i + 1))/${#NAMES[@]}] ${name}: verified"
  fetched=$((fetched + 1))
done

rm -f "${DEST}"/*.part 2>/dev/null || true
echo "==> done: ${fetched} downloaded, ${skipped} already present (${#NAMES[@]} total)"
echo "==> next: python3 tools/pipeline/extract.py --src ${DEST#"${ROOT}/"} --out dist-assets"
