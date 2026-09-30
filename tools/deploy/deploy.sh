#!/usr/bin/env bash
# Deploy the built site + generated dataset assets to Alibaba Cloud OSS.
# Plan A: the site is uploaded to the bucket ROOT so OSS static-website hosting
# serves /index.html directly; dataset assets live at a stable prefix
# <PREFIX>/data/ (uploaded once, shared across deploys). See DEPLOY.md.
#
# Required env:
#   OSS_BUCKET      e.g. gzfls-cantonese
#   OSS_ENDPOINT    e.g. oss-ap-southeast-1.aliyuncs.com (international)
#   OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
# Optional env:
#   OSS_PREFIX      default "sanguo"
#   CDN_DOMAIN      if set, refresh CDN after upload (requires aliyun CLI)
set -euo pipefail

: "${OSS_BUCKET:?set OSS_BUCKET}"
: "${OSS_ENDPOINT:?set OSS_ENDPOINT}"
: "${OSS_ACCESS_KEY_ID:?set OSS_ACCESS_KEY_ID}"
: "${OSS_ACCESS_KEY_SECRET:?set OSS_ACCESS_KEY_SECRET}"
OSS_PREFIX="${OSS_PREFIX:-sanguo}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="v$(date -u +%Y%m%d%H%M%S)"
# Plan A: the site is served from the bucket root (OSS static-website hosting,
# index document = /index.html), so the built frontend uploads to the root.
SITE_DEST="oss://${OSS_BUCKET}"
# Dataset assets live at a single stable prefix (uploaded once, shared across all
# frontend versions and future features) rather than being duplicated per version.
DATA_DEST="oss://${OSS_BUCKET}/${OSS_PREFIX}/data"

command -v ossutil >/dev/null 2>&1 || { echo "ossutil not found; install aliyun ossutil first" >&2; exit 1; }

# ossutil 2.x removed `--meta` in favor of dedicated flags (e.g. --cache-control);
# 1.x only understands `--meta`. Pick the right form for the installed major.
OSSUTIL_MAJOR="$(ossutil version 2>/dev/null | head -1 | cut -d. -f1)"
if [[ "${OSSUTIL_MAJOR}" == "2" ]]; then
  META_SITE=(--cache-control "max-age=300")
  META_DATA=(--cache-control "max-age=31536000,immutable")
  # ossutil 2.x signs with v4, which requires an explicit region; derive it from
  # the endpoint (oss-cn-hongkong.aliyuncs.com -> cn-hongkong) unless overridden.
  OSS_REGION="${OSS_REGION:-${OSS_ENDPOINT#oss-}}"
  OSS_REGION="${OSS_REGION%%.aliyuncs.com*}"
  REGION_ARGS=(--region "${OSS_REGION}")
else
  META_SITE=(--meta "Cache-Control:max-age=300")
  META_DATA=(--meta "Cache-Control:max-age=31536000,immutable")
  REGION_ARGS=()
fi

echo "==> building web"
# Site is served from the bucket root, so the frontend must reference the dataset
# by its stable absolute path /<PREFIX>/data (not the dev default /data, which
# would resolve to a non-existent bucket-root /data). Override before running to
# point at a different data origin.
export VITE_ASSET_BASE="${VITE_ASSET_BASE:-/${OSS_PREFIX}/data}"
(cd "${ROOT}/web" && npm ci && npm run build)

echo "==> uploading site -> ${SITE_DEST}/ (bucket root)"
ossutil cp -r -u "${ROOT}/web/dist/" "${SITE_DEST}/" \
  --endpoint "${OSS_ENDPOINT}" \
  "${REGION_ARGS[@]}" \
  "${META_SITE[@]}"

#echo "==> uploading dataset assets -> ${DATA_DEST}"
# Audio/index files are content-addressed by episode/sequence, cache long.
# Stable prefix: uploaded incrementally once, not duplicated under each version.
#ossutil cp -r -u "${ROOT}/dist-assets/" "${DATA_DEST}/" \
#  --endpoint "${OSS_ENDPOINT}" \
#  "${REGION_ARGS[@]}" \
#  "${META_DATA[@]}"

echo "==> publishing version marker"
echo "${VERSION}" > "${ROOT}/.deploy-version"
ossutil cp "${ROOT}/.deploy-version" "oss://${OSS_BUCKET}/${OSS_PREFIX}/CURRENT" \
  --endpoint "${OSS_ENDPOINT}" \
  "${REGION_ARGS[@]}"

if [[ -n "${CDN_DOMAIN:-}" ]]; then
  echo "==> refreshing CDN for ${CDN_DOMAIN}"
  aliyun cdn RefreshObjectCaches --ObjectPath "https://${CDN_DOMAIN}/" --ObjectType Directory || true
fi

echo "==> deployed ${VERSION}"
echo "Rollback: see tools/deploy/ROLLBACK.md"
