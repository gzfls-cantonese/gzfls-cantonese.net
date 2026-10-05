#!/usr/bin/env bash
# Refresh ONLY the mutable dataset index files (manifest.json + episodes/*.json)
# at the stable data prefix, with a short cache lifetime.
#
# Use this after regenerating dist-assets (e.g. new episode titles) instead of
# re-uploading the whole dataset: audio files are content-stable, keep their
# long immutable cache, and are NOT touched here. The frontend additionally
# stamps index URLs with ?v=<deploy version> (see web/src/config.ts), so a
# site rebuild + this upload makes refreshed data visible even to clients that
# still hold an old immutable copy.
#
# Required env: OSS_BUCKET, OSS_ENDPOINT, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET
# Optional env: OSS_PREFIX (default "sanguo")
set -euo pipefail

: "${OSS_BUCKET:?set OSS_BUCKET}"
: "${OSS_ENDPOINT:?set OSS_ENDPOINT}"
: "${OSS_ACCESS_KEY_ID:?set OSS_ACCESS_KEY_ID}"
: "${OSS_ACCESS_KEY_SECRET:?set OSS_ACCESS_KEY_SECRET}"
OSS_PREFIX="${OSS_PREFIX:-sanguo}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DEST="oss://${OSS_BUCKET}/${OSS_PREFIX}/data"

command -v ossutil >/dev/null 2>&1 || { echo "ossutil not found; install aliyun ossutil first" >&2; exit 1; }

OSSUTIL_MAJOR="$(ossutil version 2>/dev/null | head -1 | cut -d. -f1)"
if [[ "${OSSUTIL_MAJOR}" == "2" ]]; then
  META_INDEX=(--cache-control "max-age=300")
  OSS_REGION="${OSS_REGION:-${OSS_ENDPOINT#oss-}}"
  OSS_REGION="${OSS_REGION%%.aliyuncs.com*}"
  REGION_ARGS=(--region "${OSS_REGION}")
else
  META_INDEX=(--meta "Cache-Control:max-age=300")
  REGION_ARGS=()
fi

SRC="${ROOT}/dist-assets"
[[ -f "${SRC}/manifest.json" ]] || { echo "missing ${SRC}/manifest.json; run the pipeline first" >&2; exit 1; }

echo "==> uploading index files -> ${DATA_DEST} (max-age=300)"
ossutil cp -f "${SRC}/manifest.json" "${DATA_DEST}/manifest.json" \
  --endpoint "${OSS_ENDPOINT}" \
  "${REGION_ARGS[@]}" \
  "${META_INDEX[@]}"
ossutil cp -r -f "${SRC}/episodes/" "${DATA_DEST}/episodes/" \
  --endpoint "${OSS_ENDPOINT}" \
  "${REGION_ARGS[@]}" \
  "${META_INDEX[@]}"

echo "==> index refresh done. Audio untouched."
