/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ASSET_BASE?: string
  readonly VITE_DEPLOY_VERSION?: string
  readonly VITE_RECORDINGS_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
