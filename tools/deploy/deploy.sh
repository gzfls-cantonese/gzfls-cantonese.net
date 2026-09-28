#!/usr/bin/env bash
# Deploy the built site + generated dataset assets to Alibaba Cloud OSS and
# refresh the CDN. Assets are uploaded under a versioned prefix so a rollback
# is just repointing to the previous version (see ROLLBACK.md).
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
DEST="oss://${OSS_BUCKET}/${OSS_PREFIX}/${VERSION}"

command -v ossutil >/dev/null 2>&1 || { echo "ossutil not found; install aliyun ossutil first" >&2; exit 1; }

echo "==> building web"
(cd "${ROOT}/web" && npm ci && npm run build)

echo "==> uploading site -> ${DEST}/site"
ossutil cp -r -u "${ROOT}/web/dist/" "${DEST}/site/" \
  --endpoint "${OSS_ENDPOINT}" \
  --meta "Cache-Control:max-age=300"

echo "==> uploading dataset assets -> ${DEST}/data"
# Audio/index files are content-addressed by episode/sequence, cache long.
ossutil cp -r -u "${ROOT}/dist-assets/" "${DEST}/data/" \
  --endpoint "${OSS_ENDPOINT}" \
  --meta "Cache-Control:max-age=31536000,immutable"

echo "==> publishing version marker"
echo "${VERSION}" > "${ROOT}/.deploy-version"
ossutil cp "${ROOT}/.deploy-version" "oss://${OSS_BUCKET}/${OSS_PREFIX}/CURRENT" \
  --endpoint "${OSS_ENDPOINT}"

if [[ -n "${CDN_DOMAIN:-}" ]]; then
  echo "==> refreshing CDN for ${CDN_DOMAIN}"
  aliyun cdn RefreshObjectCaches --ObjectPath "https://${CDN_DOMAIN}/" --ObjectType Directory || true
fi

echo "==> deployed ${VERSION}"
echo "Rollback: see tools/deploy/ROLLBACK.md"
