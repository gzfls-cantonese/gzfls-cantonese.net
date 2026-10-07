# 部署文档（阿里云 OSS 静态托管）

把当前全部网页内容（前端构建产物 + 静态数据制品）部署到指定的阿里云 OSS Bucket。
本项目**没有独立后端服务**：所谓"后端"即静态数据制品（音频 + 索引 JSON），与前端一样都是静态文件，全部进 OSS。
若后续引入函数计算 FC（上传/评分控制面），FC 代码部署到函数计算，**不进 OSS**；OSS 只放静态资源与用户录音对象。见 §9。

**部署方案（A）：前端上传到 bucket 根**，由 OSS 静态网站托管直接以 `/index.html` 对外服务；数据制品放在稳定前缀 `<PREFIX>/data/`（默认 `sanguo/data/`），一次上传、跨部署共用。不使用 CDN 回源到版本目录。

配套文件：

- `deploy.sh` — 上传脚本（site → bucket 根；数据 → 稳定前缀）
- `deploy-data-index.sh` — 只刷新 `manifest.json` 与 `episodes/*.json`（不重传音频）
- `deploy-recordings.sh` — 录音函数打包脚本（zip + env 清单；**不推送、不调用云 API**）
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

前端用 `BrowserRouter`（路径如 `/episode/1`、`/about`）。直接访问深链接时 OSS 找不到对应对象，必须让静态托管把「找不到的 key」回退到 `index.html`，否则深链会返回原始 XML `NoSuchKey`（`Content-Type: application/xml`）。在 Bucket 控制台开启**静态页面**：

- **默认首页**（IndexDocument.Suffix）：`index.html`
- **默认 404 页**（ErrorDocument.Key）：`index.html`
- **错误文档响应码**（ErrorDocument.HttpStatus）：**`200`** ← **SPA 必设**。缺省是 `404`：即便回退到 `index.html`，浏览器/爬虫仍收到 404 状态，深链在部分场景（预取、SEO、某些客户端）被判为「页面不存在」。设为 `200` 才能让深链以成功状态返回应用外壳，由前端路由接管渲染。
- **子目录首页**（SupportSubDir）：关闭（默认）。
- 访问入口用**静态网站托管 Endpoint** 或**绑定自定义域名**指向该 Bucket；自定义域名解析到静态托管入口后，index/error 规则同样生效。注意：错误页/首页规则属于**静态网站托管配置**，只有走 website 端点或绑定了该托管的自定义域名才生效；用标准 bucket 端点直接取对象不会触发回退。

数据在同一 bucket 的 `<PREFIX>/data/` 下，前端以 `/sanguo/data/...` 绝对路径访问，无需额外配置。

**命令行方式（ossutil 2.x，等价于控制台上述四项）：**

```bash
ossutil api put-bucket-website --bucket "<BUCKET>" --website-configuration '{
  "IndexDocument": { "Suffix": "index.html", "SupportSubDir": false },
  "ErrorDocument": { "Key": "index.html", "HttpStatus": "200" }
}'
# 校验当前配置：
ossutil api get-bucket-website --bucket "<BUCKET>"
```

> 需 RAM 权限 `oss:PutBucketWebsite`。`index.html` 必须是 bucket 内已存在的对象（部署后即在根）。

---

## 6. 验证

1. 访问站点根 `/`，确认首页加载；直接访问 `/episode/1`、`/about` 深链接也能渲染（验证 404→index.html 生效）。
   - 命令行判据（回退是否生效）：
     ```bash
     curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://<域名>/episode/1
     ```
     **期望** `200 text/html`。若得到 `404 application/xml`（body 为 `NoSuchKey`），说明静态托管错误页未配或响应码非 200 —— 回到 §5。
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

---

## 9. 录音函数（可选特性）

站点主体是纯静态的；录音函数是独立部署的可选特性。它不进 OSS，部署在函数计算或任意常驻容器上。

### 9.1 匿名试讲录音函数（已实现）

代码在 `server/recordings/`：零依赖 Node HTTP 服务，监听 `$PORT`，只提供 `POST /presign-upload`（签名上传）、`POST /dispose`（删除）与 `POST /assess`（按需评分，见 9.2）三个操作，**没有列表或下载接口**。匿名 ID 只经 `X-Anon-Id` 头传入，对象 key 恒由服务端按该 anon 前缀重建，客户端无法寻址他人录音。

**打包（脚本本身不推送、不调用任何云 API）**

```bash
# 先看计划：打印 env 清单与部署命令，不写文件、不调云
bash tools/deploy/deploy-recordings.sh --dry-run

# 实际打包：生成 dist-deploy/recordings/<fn>.zip 与同名 .env 清单（dist-deploy/ 已 gitignore）
export OSS_BUCKET=... OSS_ENDPOINT=... OSS_ACCESS_KEY_ID=... OSS_ACCESS_KEY_SECRET=...
bash tools/deploy/deploy-recordings.sh            # 可选 --out DIR / --function NAME
```

**函数环境变量**（`.env` 清单由脚本生成，非密钥项按当前环境填值）

| 变量 | 默认 | 说明 |
|---|---|---|
| `OSS_BUCKET` / `OSS_ENDPOINT` | 无 | oss 后端必需；缺失则函数启动即抛错 |
| `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 无 | **密钥**，清单里只写 `__SET_IN_SECRET_STORE__` 占位符，真实值只放平台函数环境或密钥管理，**绝不入库** |
| `RECORDINGS_PREFIX` | `recordings` | 私有前缀；对象 key = `<prefix>/<anon>/<episode>_<entryId>_<recId>.<ext>` |
| `RECORDINGS_MAX_DURATION` | `60` | 单段录音秒数上限，超出返回 413 |
| `RECORDINGS_PRESIGN_TTL` | `300` | 签名 URL 有效期（秒） |
| `PORT` | `8788` | 监听端口 |
| `RECORDINGS_LOCAL_DIR` | 未设 | 设了即切 **local 后端**（文件落盘、无需云凭据），仅用于本地开发/e2e |

> 启用评分还需 `DASHSCOPE_API_KEY` 与 `ASSESS_*` 一组变量，见 9.2。**`deploy-recordings.sh` 生成的 `.env` 清单目前只覆盖上表（录音上传/销毁），`ASSESS_*` 需直接在平台的函数环境里加**；不设 `DASHSCOPE_API_KEY` 即等价于评分关闭。

**部署与 bucket 配置**

1. 函数运行时 custom（node ≥ 18），启动命令 `node server.mjs`，上传上面的 zip，按 `.env` 清单设环境变量，挂 HTTP 触发器并记下公网 URL。

   ⚠️ **HTTP 触发器「认证方式」必须选「无需认证」（anonymous），不能用「签名认证」**。本接口面向公网浏览器，前端无法对 FC 请求签名；若误选签名认证，所有 `presign-upload`/`dispose`/`assess` 会被 FC 网关直接挡下（浏览器只能本地回放刚录的音频，上传与评分全废）。请求方法需放行 `POST`、`GET`、`OPTIONS`（`OPTIONS` 供 CORS 预检）。访问隔离靠 `X-Anon-Id` 前缀 + 服务端重建 key，不靠 FC 签名，故无需认证是符合设计的。

   **排障（评分按钮不显示 / 上传失败）**：先绕过前端直接打接口，看返回体：

   ```bash
   curl -s -X POST https://<HTTP触发器URL>/presign-upload \
     -H 'content-type: application/json' \
     -H 'x-anon-id: 11111111-1111-4111-8111-111111111111' \
     -d '{"episode":1,"entryId":"sg_001_001","durationSec":5,"mime":"audio/webm"}'
   ```

   > body 四字段缺一不可（前端 `presignUpload` 会自动带全，手写测试命令时才易漏）：`episode`（数字 1–999，独立字段、**不从 `entryId` 推导**）、`entryId`（`[A-Za-z0-9_-]{1,64}`）、`durationSec`（>0 且 ≤ `RECORDINGS_MAX_DURATION`，默认 60）、`mime`。`x-anon-id` 须是合法 UUID v4。

   | 返回 | 含义 | 处理 |
   |---|---|---|
   | `{"Code":"MissingRequiredHeader",...Date...}` | 触发器是**签名认证** | 改为「无需认证」（见上） |
   | `{"error":"invalid episode"}` | body 缺 `episode`（数字，1–999），或非法 | 带上 `"episode":<集号>` |
   | `{"error":"duration exceeds limit"}`（413） | 缺 `durationSec`（`Number(undefined)=NaN`）或超上限 | 带上 `"durationSec":<秒>`，且 ≤ `RECORDINGS_MAX_DURATION` |
   | `{"error":"invalid entryId"}` / `invalid anon` 等 | 对应字段非法（`entryId` 须匹配 `[A-Za-z0-9_-]{1,64}`；`x-anon-id` 须是合法 UUID v4） | 按格式修正重试 |
   | `{"recId":...,"uploadUrl":...,"assessAvailable":false}` | 上传链路通，但**评分未开** | 补函数环境 `DASHSCOPE_API_KEY` + `ASSESS_ASR_BASE`（见 9.2），重启后应变 `true` |
   | `{...,"assessAvailable":true}` | 全通 | 刷新页面，「評分」按钮出现 |

   > 注：`assessAvailable` 由服务端计算（`config.mjs`）——需 `DASHSCOPE_API_KEY` 非空**且**（oss 后端或 `ASSESS_ASR=fake`）。前端「評分」按钮只在该字段为 `true` 时渲染，故「只能回放、无评分」优先查此字段，而非怀疑权限或新加坡延迟（延迟只会让评分慢/超时，不会让按钮消失）。
2. OSS **CORS**（控制台 → bucket → 「权限管理 / 数据安全」下的 **跨域设置 CORS** → 创建规则）。浏览器**直接** `PUT` 录音到 bucket 的签名地址，页面 origin 是站点域名，故必须放行：

   | 字段 | 值 |
   |---|---|
   | 来源 Origin | 站点 origin，一行一个（如 `https://<自定义域名>`；本地联调再加 `http://localhost:5180`）。写**协议+域名(+端口)**，不带路径/结尾斜杠 |
   | 允许 Methods | **PUT**（上传只需 PUT；可一并勾 GET/HEAD 备用） |
   | 允许 Headers | `*`（需覆盖 `Content-Type`） |
   | 暴露 Headers | 可留空；如需可读 `ETag` 就填 `ETag`（本项目客户端只判 `res.ok`，非必需） |
   | 缓存时间 MaxAgeSeconds | `600` |
   | 返回 Vary: Origin | 建议勾选（多 origin 时避免缓存串味） |

3. OSS **生命周期**（bucket → 「数据管理 / 基础设置」下的 **生命周期 Lifecycle** → 创建规则）。兜底自清：客户端退出/卸载时的 `/dispose` 可能没送达（关页面、断网），故按前缀定期删除，也呼应隐私声明里的「7 天生命周期兜底」：

   | 字段 | 值 |
   |---|---|
   | 规则名称 | 如 `recordings-expire-7d` |
   | 应用范围 | **指定前缀** `recordings/`（带结尾斜杠，须与 `RECORDINGS_PREFIX` 一致） |
   | 文件过期策略 | 「距**最后修改时间** N 天后**删除**」，N = `7` |
   | 碎片（Multipart）过期 | 可选建议：`AbortMultipartUpload` 距最后修改 7 天 |
   | 状态 | 启用 |

   ⚠️ 前缀务必是 `recordings/`，**不要**留空或写 `/`（会作用整个 bucket）。本站数据在 `sanguo/data/`、站点在根（`index.html`/`assets/`）、录音在 `recordings/`，三者互不覆盖。

4. **RAM**（在 **RAM 访问控制控制台**，不在 OSS 控制台）：为函数**单独建一把专用 AK，不要复用 `deploy.sh` 上传站点/数据的那把**（部署 key 对整个 bucket 有读写，塞进公网可达的函数 env 风险不对等；专用 key 泄露也只能动 `recordings/*`）。步骤：

   1. RAM → 身份管理 → 用户 → **创建用户**（如 `sanguo-recordings-fn`），访问方式只勾 **OpenAPI 调用访问** → 生成并保存 AccessKey（Secret 只显示一次）。
   2. RAM → 权限管理 → 权限策略 → **创建权限策略** → 脚本编辑（JSON），贴入下方策略。
   3. 回到用户 → **添加权限** → 选该自定义策略授权给它。
   4. 把这把 AK 填进 **FC 函数环境变量** `OSS_ACCESS_KEY_ID/SECRET`（在函数计算侧，不在 OSS 控制台）。

   策略（对象级三动作、限定前缀；**未启用评分时可去掉 `oss:GetObject`**，仅留 put/delete）：

   ```json
   {
     "Version": "1",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["oss:PutObject", "oss:GetObject", "oss:DeleteObject"],
         "Resource": ["acs:oss:*:*:<BUCKET>/<RECORDINGS_PREFIX>/*"]
       }
     ]
   }
   ```

   - 只写**对象级** resource（`.../<prefix>/*`）、**不写 bucket 级** resource（`acs:oss:*:*:<BUCKET>`），`oss:ListObjects` 天然被拒——这正是「不给 list」的落地方式（客户端无法枚举他人录音），无需另写 Deny。
   - `HeadObject`（`backend.exists`）与评分签发的仅-GET URL 都需 `GetObject`；签名上传需 `PutObject`；销毁需 `DeleteObject`。
   - 改过 `RECORDINGS_PREFIX` 就把策略里的前缀一并改掉。
   - **注**：当前 `oss.mjs` 用**静态长期 AK** 做 V1 签名，不支持 STS 临时凭证（签名里不带 `x-oss-security-token`）。若日后想改用 FC 服务角色下发的临时凭证（函数 env 不放长期 AK），需先给 `oss.mjs` 加 security-token 支持——属后续加固，未实现。
5. 前端构建时注入 `VITE_RECORDINGS_API=<HTTP 触发器 URL>`（参考 `web/.env.example`）。**不注入则整套录音 UI 不渲染——这就是回滚开关**（另一条回滚路径是直接下线 HTTP 触发器，前端会因取不到 API 而隐藏录音 UI；详见 `ROLLBACK.md`）。

**本地开发**（无需云凭据）

```bash
RECORDINGS_LOCAL_DIR=/tmp/recfn PORT=8799 node server/recordings/server.mjs
VITE_RECORDINGS_API=http://localhost:8799 npm run dev --prefix web
```

> `vite preview` **不会**挂 `/data` 中间件（那是 dev-only），本地验证数据加载请用 `npm run dev`。

### 9.2 AI 评分（已实现：真实 ASR 客户端 + 同音容错打分）

> ✅ **当前状态**：`POST /assess` 端点、归属重建与存在性检查、参考文本加载（含缓存与 `jyutping`）、**真实 DashScope 客户端**（`asr.mjs` real 模式：`qwen3-asr-flash`、OpenAI 兼容 `/compatible-mode/v1/chat/completions`、同步不轮询、20s 超时）、**同音容错相似度**（去调粤拼音节级，字典 `jyutping-dict.json` 随包）、`ASSESS_ASR=fake` 离线桩、`assessAvailable` 开关与前端「评分」按钮/回显**均已实现并有单测**（服务端合计 65 项）。注入真实 `DASHSCOPE_API_KEY` + `ASSESS_ASR_BASE` 即产出真实分数。**task 2.0 格式实测门槛已通过**：真实浏览器 `.webm`(Chrome/Edge) 与 `.m4a`(Safari) 容器均被 `qwen3-asr-flash` 接受、粤语转写输出为**繁体**（与参考一致，不触发繁简归一）。剩余仅 task 5.2 的云端 oss 后端冒烟。规格与任务见 openspec change `add-user-recorded-cantonese-reading-simple-assessment-in-aliyun-faas-and-ai-framework`。
>
> 本小节其余内容（采购、地域、RAM、模型选择、回滚）**不依赖代码**，可提前完成。

**服务与地域（最容易踩的坑）**

- 用的是阿里云百炼（Model Studio）**国际站**的语音识别，不是某个「评分产品」；评分算法（转写 + 与原文的**同音容错**相似度，去调粤拼音节级）由我们自己的函数计算。
- 百炼国际站**必须按地域开通**，可用地域为**新加坡 `ap-southeast-1`**（另有美东弗吉尼亚）——**香港没有此服务**。本站 OSS 与函数在香港，属跨地域公网调用，延迟可忽略。
- 计费与中国站**完全独立**：按分钟出账、按月结算。API Key 是**地域级凭据**，拿去调中国站 endpoint 会 401。

**开通步骤**

1. 国际站账号登录 Model Studio 控制台 → **地域切到 Singapore** → 同意服务条款即自动开通。
2. 绑定付款方式；在费用中心设**月度预算告警**（建议 $10 级）。单价量级极低（单次评分远低于一分钱），真正的风险是被脚本无限刷——服务端已加 per-anon + per-IP、每小时 + 每日双固定窗口限流（`ASSESS_RATE_HOURLY`/`ASSESS_RATE_DAILY`，超限 429 且不计费），但状态在单实例进程内、多实例下为尽力而为，故预算告警仍是硬兜底。
3. 创建 API Key（`sk-...`），并记下控制台给出的 base URL：可能是 `https://dashscope-intl.aliyuncs.com`，也可能是按工作空间隔离的 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`——**以控制台实际值为准**。
4. RAM：录音函数所用子账号在 `recordings/*` 前缀**加 `oss:GetObject`**（现仅 put/delete；仍不给 list）——即 9.1 第 4 步那份策略 JSON（已含 `GetObject`）。函数据此签发**仅 GET**、TTL = `RECORDINGS_PRESIGN_TTL`（300s）的签名 URL 交给 ASR。

**模型选择**

默认 `qwen3-asr-flash`：**同步调用**、粤语语言码 `yue`、单文件 ≤5 分钟且 ≤10 MB、接受公网可达 URL（官方建议托管在 OSS 且直接访问返回 200）。本项目单段 ≤60s、opus/webm 数百 KB，余量充足。带 `-filetrans` 后缀的变体与 `paraformer-v2` 录音文件识别**只支持异步**（提交 `task_id` 后轮询），会要求在一次请求内轮询并抬高函数超时，故不作默认。

**环境变量（代码已读取，见 `server/recordings/README.md`）**

| 变量 | 建议值 | 说明 |
|---|---|---|
| `DASHSCOPE_API_KEY` | `sk-...` | **密钥**，必需。不配 ⇒ `assessAvailable=false` ⇒ 前端「评分」按钮不渲染 |
| `ASSESS_ASR_BASE` | 控制台显示的 intl endpoint | 地域相关，必须可配，勿硬编码。**必须含协议前缀 `https://`**——代码直接拼 `${ASSESS_ASR_BASE}/compatible-mode/v1/chat/completions`，只去尾斜杠、不补 scheme；漏了 `https://`（如误填 `ws-xxx.ap-southeast-1.maas.aliyuncs.com`）会让 `fetch` 抛非法 URL，`/assess` 返回 `503 {"error":"ASR unreachable"}`，前端显示「評分失敗」。工作空间专属域名（`{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`）须配同一工作空间/新加坡地域下创建的 API Key |
| `ASSESS_ASR_MODEL` | `qwen3-asr-flash` | 可覆盖 |
| `ASSESS_ASR_LANG` | `auto` | 语种提示。**默认 `auto`：不发 `asr_options.language`，让 ASR 真自动检测**——这是非粤语告警能生效的前提。实测：auto 下粤语→检测 `yue`+繁体转写、普通话→检测 `zh`+简体转写；函数读响应里的**检测语种**（`annotations[].language`），非粤语仍照常打分但加 `languageWarning:true`，前端显示「偵測到非粵語發音，建議用粵語朗讀」。⚠️ **不要设成 `yue`**：强制粤语提示会让检测语种**恒回显 `yue`**（实测普通话也返回 `yue`），告警彻底失效。若要更严（普通话直接不给分），把 `assess.mjs` 的警告改成拦截 |
| `ASSESS_DATASET_BASE` | 生产可留空 | 参考文本来源；未设时按 `https://<OSS_BUCKET>.<OSS_ENDPOINT>/<OSS_PREFIX>/data` 推导（故需 `OSS_PREFIX`，默认 `sanguo`）。**local 后端无 OSS 配置 ⇒ 推导为空 ⇒ 评分 503，本地必须显式设置** |
| `ASSESS_ASR` | `fake` | **仅本地/e2e**：走确定性 stub 转写，不发网络请求。仍需一个占位 `DASHSCOPE_API_KEY` 才会亮起按钮 |
| `ASSESS_RATE_HOURLY` | `10` | `/assess` 每匿名 ID / 每客户端 IP 的每小时评分上限，设 `0` 关窗。命中返回 `429` + `Retry-After`，不计费 ASR |
| `ASSESS_RATE_DAILY` | `100` | 同上的每日上限，设 `0` 关窗。**限流状态在单实例进程内，多实例下为尽力而为**，硬上限仍靠预算告警 |

**本地跑通评分链路（离线、不计费）**

```bash
RECORDINGS_LOCAL_DIR=/tmp/recfn PORT=8799 \
DASHSCOPE_API_KEY=test-key ASSESS_ASR=fake \
ASSESS_DATASET_BASE=http://localhost:5180/data \
node server/recordings/server.mjs

VITE_RECORDINGS_API=http://localhost:8799 npm run dev --prefix web   # 需已生成 dist-assets/
```

长按录音 → 松开上传 → 气泡出现「評分」→ 点击后回显分数与（桩）转写。

**上线前实测（tasks 2.0，已通过 2026-10-06）**

用 `tools/spike-asr.mjs`（base64 data URL，无需 OSS）对新加坡 `qwen3-asr-flash` 实测真实浏览器录音：(a) `.webm`(Chrome/Edge) 与 `.m4a`(Safari) **两种容器均被接受、返回 HTTP 200**（文档只点名 AAC/WAV/MP3，但 webm/opus 实测可用，故无需改录音格式）；(b) 粤语转写质量可用；(c) **输出为繁体**，与参考文本一致，不触发繁简归一。复现：
```bash
export DASHSCOPE_API_KEY='sk-...' ASSESS_ASR_BASE='https://dashscope-intl.aliyuncs.com'
node tools/spike-asr.mjs rec-edge.webm rec-safari.m4a
```

**同音打分字典**：评分用 `server/recordings/jyutping-dict.json`（`字→去调粤拼`，约 40KB）做同音容错，随函数打包、无运行时依赖。它由 `tools/pipeline/build_jyutping_dict.mjs` 从已发布的 `dist-assets/episodes/*.json` 派生；**数据集（粤拼）变更后须重新生成并重新打包**：`node tools/pipeline/build_jyutping_dict.mjs`。

**灰度与回滚**

不注入 `DASHSCOPE_API_KEY` ⇒ `assessAvailable=false` ⇒ 评分入口不出现，界面与现状一致；移除 Key 或回退函数版本即可整体下线评分，**录音上传/销毁不受影响**。

**隐私提醒**：评分会把访客录音交给第三方 AI 服务处理（分数与转写不持久化、退出即销毁语义不变），这改变了录音功能原先「仅本地回放」的隐私姿态。**已在前端告知**：单集录音区提示文案改为「當前小節試講和AI評分」，其下下划线链接「錄音和AI評分隱私處理聲明」指向新页面 `/recording-privacy`（说明收集范围、匿名隔离存放、退出即销毁 + 生命周期兜底、向第三方 AI 提供短时效只读链接且结果不持久化）。该页随前端构建一并部署，无需函数侧改动。
