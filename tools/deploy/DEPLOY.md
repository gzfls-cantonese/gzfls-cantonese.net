# 部署文档（阿里云 OSS 静态托管）

把当前全部网页内容（前端构建产物 + 静态数据制品）部署到指定的阿里云 OSS Bucket。
本项目**没有独立后端服务**：所谓"后端"即静态数据制品（音频 + 索引 JSON），与前端一样都是静态文件，全部进 OSS。
若后续引入函数计算 FC（上传/评分控制面），FC 代码部署到函数计算，**不进 OSS**；OSS 只放静态资源与用户录音对象。

**部署方案（A）：前端上传到 bucket 根**，由 OSS 静态网站托管直接以 `/index.html` 对外服务；数据制品放在稳定前缀 `<PREFIX>/data/`（默认 `sanguo/data/`），一次上传、跨部署共用。不使用 CDN 回源到版本目录。

配套文件：

- `deploy.sh` — 上传脚本（site → bucket 根；数据 → 稳定前缀）
- `ROLLBACK.md` — 回滚方案（本目录）

---

## 1. 架构与产物

| 产物 | 来源 | 上传目标 |
|---|---|---|
| 前端构建产物 | `web/` → `npm run build` → `web/dist/` | **bucket 根** `oss://<BUCKET>/`（`index.html`、`assets/` 在根） |
| 数据制品（音频 + 索引 + 粤拼） | `tools/pipeline/extract.py` → `dist-assets/` | `<PREFIX>/data/`（**稳定前缀，一次增量上传，跨部署共用**） |
| 部署标记 | 脚本生成 | `<PREFIX>/CURRENT`（文本，内容为本次部署的时间戳版本号） |

OSS 目录布局：

```
oss://<BUCKET>/index.html            # 前端（bucket 根，静态托管默认首页）
oss://<BUCKET>/assets/...            # 前端打包资源
oss://<BUCKET>/<PREFIX>/data/        # 音频 + 索引（稳定，一次上传，所有部署 + 未来特性共用）
oss://<BUCKET>/<PREFIX>/CURRENT      # 本次部署版本标记
```

前端在根目录，所以 OSS 静态网站托管访问 `/` 即返回 `index.html`；数据在稳定前缀 `<PREFIX>/data/`，前端通过 `VITE_ASSET_BASE=/<PREFIX>/data`（deploy.sh 构建时自动注入）访问，二者路径解耦。数据用 `ossutil cp -r -u` 增量上传，未变对象跳过，避免重复传 ~2.5GB。

---

## 2. 前提准备

1. **安装工具**
   - `ossutil`（必需，上传用）。**2.x 与 1.x 的 flag 不同**：2.x 用 `--cache-control` / `--region`（v4 签名必需），1.x 用 `--meta`。`deploy.sh` 已按主版本自动适配，无需手工处理。
2. **创建 Bucket**（阿里云国际站控制台）
   - 选地域：如**香港** `oss-cn-hongkong`（国际站香港地域**免 ICP 备案**）。
   - 记录 endpoint，如 `oss-cn-hongkong.aliyuncs.com`。
   - 读写权限：静态站建议**公共读**。
3. **AccessKey**：建 RAM 子账号，授权对该 Bucket 的读写；取得 `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET`。
4. **本地数据制品**：确保 `dist-assets/` 已生成；未生成先跑：
   ```bash
   pip install -r tools/pipeline/requirements.txt
   python3 tools/pipeline/extract.py --src CanCLID/zoengjyutgaai --out dist-assets
   ```
   （`dist-assets/` 为构建产物，已 gitignore，不入库；源数据来自 HuggingFace CC0 数据集，本地一次性下载。）

---

## 3. 前端数据源 base（deploy.sh 自动处理）

前端运行时从 `VITE_ASSET_BASE` 拉取 `manifest.json` / `episodes/` / `audio/`（见 `web/src/config.ts`）。

- 因为前端在 **bucket 根**、数据在 **`<PREFIX>/data/`**，`deploy.sh` 在构建前会自动设：
  ```bash
  export VITE_ASSET_BASE="${VITE_ASSET_BASE:-/${OSS_PREFIX}/data}"   # 默认 /sanguo/data
  ```
  这样打包产物里数据 URL 为 `/sanguo/data/...`，经 bucket 根 origin 正好命中 `oss://<BUCKET>/sanguo/data/...`。**一般无需手动设置。**
- 如需指向别的数据源，运行前覆盖 `VITE_ASSET_BASE` 即可（例如绝对 URL）。
- **开发期**：默认 `/data`（vite 中间件映射本地 `dist-assets`），无需改动。

> `.env.production` 被 `.gitignore`（`.env.*`）忽略、不入库；生产值由 `deploy.sh` 注入，或参照已入库的 `web/.env.example` 在本地创建。

---

## 4. 执行部署

导出目标与凭证，然后运行脚本：

```bash
export OSS_BUCKET=<你的bucket>            # 如 gzfls-cantonese
export OSS_ENDPOINT=oss-cn-hongkong.aliyuncs.com
export OSS_ACCESS_KEY_ID=...
export OSS_ACCESS_KEY_SECRET=...
export OSS_PREFIX=sanguo                  # 可选，默认 sanguo
export OSS_REGION=cn-hongkong             # 可选；ossutil 2.x 默认从 endpoint 推导
# export VITE_ASSET_BASE=/sanguo/data     # 可选；不设则脚本按 /<PREFIX>/data 自动注入

bash tools/deploy/deploy.sh
```

脚本自动完成：

1. 注入 `VITE_ASSET_BASE=/<PREFIX>/data` 后 `npm ci && npm run build`（构建前端）
2. 上传 `web/dist/` → **bucket 根** `oss://<BUCKET>/`（`Cache-Control:max-age=300`）
3. 上传 `dist-assets/` → `<PREFIX>/data/`（**稳定前缀**，`Cache-Control:max-age=31536000,immutable`，`ossutil -u` 增量）
4. 写 `<PREFIX>/CURRENT` = 本次版本号（部署时间戳标记）

> **数据只需传一次**：数据在稳定前缀，重复部署内容不变时 `-u` 会跳过。若你在 `deploy.sh` 中把数据上传段注释掉以加速重复部署，请**确保首次已把 `dist-assets/` 传到 `<PREFIX>/data/`**（否则前端会取不到 `manifest.json`/音频而 404）。需要时可单独执行：
> ```bash
> ossutil cp -r -u dist-assets/ "oss://${OSS_BUCKET}/${OSS_PREFIX}/data/" \
>   --endpoint "${OSS_ENDPOINT}" --region cn-hongkong --cache-control "max-age=31536000,immutable"
> ```

> **只刷新数据索引（不重传音频）**：重新生成 `dist-assets/` 后（例如更新集标题/篇名），`manifest.json` 与 `episodes/*.json` 需要同步到稳定前缀；音频内容稳定、保持 immutable 长缓存，不必重传。执行：
> ```bash
> bash tools/deploy/deploy-data-index.sh
> ```
> 该脚本只上传 `manifest.json` 与 `episodes/*.json`，并以 `Cache-Control:max-age=300` 覆盖对象上旧的 immutable 头。**注意**：已被旧 immutable 缓存污染的客户端不会主动重请求同一 URL；前端对索引 JSON 的请求带 `?v=<部署版本>` 查询参数（构建时由 `VITE_DEPLOY_VERSION` 注入，见 `web/src/config.ts`），因此刷新数据后需**重新执行 `deploy.sh` 发布带新版本号的站点**，客户端才会以新 URL 取到新索引。两者都完成后，标题/篇名等变更才对所有客户端可见。

> 历史遗留：早期部署在 `sanguo/v<timestamp>/{site,data}/` 下留有副本，新脚本不再写入这些路径；确认无用后可手动清理以省存储（非必需，谨慎删除）。

---

## 5. 配置 OSS 静态网站托管（bucket 根）

在 Bucket 控制台开启**静态页面**：

- **默认首页**：`index.html`
- **默认 404 页**：`index.html` ← **重要**：前端用 `BrowserRouter`（路径如 `/episode/1`、`/about`），直接访问深链接时 OSS 找不到对应对象；把 404 页也设为 `index.html`，可让单页应用加载后由前端路由接管（返回码为 404 但页面正常渲染）。
- 访问入口用**静态网站托管 Endpoint**（形如 `<BUCKET>.oss-cn-hongkong.aliyuncs.com` 的 website 端点）或**绑定自定义域名**指向该 Bucket；自定义域名解析到静态托管入口后，用户访问 `/` 即得首页。

数据在同一 bucket 的 `<PREFIX>/data/` 下，前端以 `/sanguo/data/...` 绝对路径访问，无需额外配置。

---

## 6. 验证

1. 访问站点根 `/`，确认首页加载；直接访问 `/episode/1`、`/about` 深链接也能渲染（验证 404→index.html 生效）。
2. 打开 `<PREFIX>/data/manifest.json`（如 `/sanguo/data/manifest.json`），确认 `episodeCount=157`、`recordCount` 与源一致。
3. 直接打开任一条音频 URL（`/sanguo/data/audio/<NNN>/<file>.opus`），确认可播放；在集详情页点开一句，确认跳转播放正常。

---

## 7. 成本与计费（估算）

- **计费模式**：OSS 默认**按量付费（后付费）**，按月出账扣费，**无需预付**；只需国际站账号 + 有效支付方式。可选预付费资源包抵扣（非必需）。
- **上传这一次**：流入流量**免费** + 约 4 万次 PUT ≈ $0.02；之后存储 2.5GB ≈ $0.05/月。
- **运行期主要成本**：用户播放的**流出流量**（按 GB，香港约 $0.08–0.12/GB）+ GET 请求费。
- 价格为地域相关估算，以阿里云国际站官方定价页为准。

---

## 8. 合规提醒

- 国际站**香港地域免 ICP 备案**；若改用中国大陆地域，自定义域名需 ICP 备案。
- 各集插图版权未确认前一律占位图，不展示未授权图片（见 README）。
