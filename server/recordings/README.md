# recordings fn

匿名试讲录音的最小 serverless 后端：只签发**上传**（PUT）短时签名、**删除**，以及按需的**评分**（粤语 ASR 转写 + 与参考文本的同音容错相似度）三类操作，无 list/download 接口。对象存放于按匿名 ID 隔离的私有前缀下，支持多个匿名会话并发上传而互不干扰、互不可寻址。

归属模型：匿名 ID 仅经 `X-Anon-Id` 请求头传入，对象 key 始终在该 anon 前缀下由服务端重建，客户端无法传完整 key，因此无法寻址他人对象。跨 anon 的删除只会命中不到对象（返回 `deleted:0`），跨 anon 的评分只会命中不到对象（返回 `404`），而非报错。

评分为无状态单次计算：分数与转写**不写回对象存储**，只在响应里回显；录音销毁后即不可再评分（同样返回 `404`）。

> **实现状态**：`POST /assess` 的归属、校验、参考文本、**真实 DashScope ASR 客户端**（`qwen3-asr-flash`、OpenAI 兼容 `/compatible-mode/v1/chat/completions`、同步不轮询）、**同音容错相似度**、**语种检测告警**（非粤语朗读仍打分但标 `languageWarning`）与**服务端限流**（per-anon + per-IP、每小时 + 每日双固定窗口、429 + Retry-After）均已实现并有单测（服务端合计 80 项）。task 2.0 格式实测门槛已通过：真实浏览器 `.webm`(Chrome/Edge) 与 `.m4a`(Safari) 容器均被接受、粤语转写输出为**繁体**（与参考一致，不触发繁简归一）。**语种检测走自动检测**（默认 `ASSESS_ASR_LANG=auto` 不发语种提示）：实测粤语→`yue`+繁体、普通话→`zh`+简体；若发 `yue` 提示则检测语种被恒回显为 `yue`、告警失效。尚待：注入真实凭据后的云端 oss 后端冒烟（change `tasks.md` 5.2）。

## 环境变量

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `RECORDINGS_LOCAL_DIR` | 否 | 无 | 设置后启用 **local** 后端（dev/e2e），录音落盘到该目录，函数自身接受 presign 返回的 `PUT /local-put/<key>`。**未设置时启用 oss 后端。** 该路由无鉴权，故 local 后端**不得在生产启用**：本变量与任一 `OSS_*` 凭据同时设置时**启动即报错**（错误信息同时点名两侧），不做二选一的猜测。 |
| `OSS_BUCKET` | oss 必填 | 无 | OSS bucket 名。 |
| `OSS_ENDPOINT` | oss 必填 | 无 | OSS endpoint，可含或不含 `http(s)://` 前缀（内部会剥离）。 |
| `OSS_ACCESS_KEY_ID` | oss 必填 | 无 | 建议使用仅对 `recordings/` 前缀有 put/get/delete 权限的 RAM 子账号（get 仅评分需要）。 |
| `OSS_ACCESS_KEY_SECRET` | oss 必填 | 无 | 同上。 |
| `RECORDINGS_PREFIX` | 否 | `recordings` | 对象 key 前缀，也是 lifecycle 规则与 RAM 授权的作用域。 |
| `RECORDINGS_MAX_DURATION` | 否 | `60` | 单段录音时长上限（秒）。超限的 presign 请求返回 413。MUST 为 > 0，否则启动即报错。 |
| `RECORDINGS_PRESIGN_TTL` | 否 | `300` | 签名 URL 有效期（秒），**上传（PUT）与评分取回（GET）共用**。 |
| `RECORDINGS_ALLOWED_ORIGINS` | 否 | 内置站点 origin 列表 | 逗号分隔的 CORS 白名单。只有名单内的 `Origin` 会被回显 `Access-Control-Allow-Origin`，**不在名单内则该头整个不发**（浏览器随后拦截响应）。换域名部署时必须设置，否则录音功能在浏览器里静默失败。内置默认同时含 `https://gzfls-cantonese.net`、`http://gzfls-cantonese.net`（站点当前 http/https 都可达且无跳转）与 `http://localhost:5173`。 |
| `PORT` | 否 | `8788` | HTTP 监听端口。 |
| `DASHSCOPE_API_KEY` | 评分必填 | 无 | 阿里云百炼（Model Studio）**地域级** API Key。未设置 ⇒ 评分整体关闭（`assessAvailable=false`，前端隐藏入口），这也是评分功能的回滚开关。 |
| `ASSESS_ASR` | 否 | 无（= 调用真实服务） | 设为 `fake` 使用确定性离线桩转写，供 local 后端 / e2e 跑通整条链路。**注意：按 `assessAvailable` 判据，fake 模式仍需一个（占位）`DASHSCOPE_API_KEY` 才会亮起前端按钮。** |
| `ASSESS_ASR_BASE` | 评分必填 | 无 | 国际站 DashScope base URL。控制台可能给 `https://dashscope-intl.aliyuncs.com` 或按工作空间隔离的 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`，**以控制台实际值为准**。 |
| `ASSESS_ASR_MODEL` | 否 | `qwen3-asr-flash` | 同步调用的粤语 ASR 模型。单文件 ≤5 分钟且 ≤10 MB（本项目单段 ≤60s，余量充足）。带 `-filetrans` 的变体与 `paraformer-v2` 录音文件识别**只支持异步**（提交 task 后轮询），不作默认。 |
| `ASSESS_ASR_LANG` | 否 | `auto` | 语种提示。默认 `auto` **不发** `asr_options.language`，让 ASR 真自动检测——这是「非粤语告警」的依据（粤语仍回 `yue`+繁体转写，普通话回 `zh`+简体）。设为 `yue` 会强制粤语提示，**但会让检测语种恒回显 `yue`、令告警失效**，除非确知只读粤语否则不要设。 |
| `ASSESS_DATASET_BASE` | 否 | 由 OSS 配置推导 | 参考文本（公共数据集）根地址。未设置时推导为 `https://<OSS_BUCKET>.<OSS_ENDPOINT>/<OSS_PREFIX>/data`，故需同时设 `OSS_PREFIX`（默认 `sanguo`）。**local 后端无 OSS 配置 ⇒ 推导为空 ⇒ 评分返回 503，本地 e2e 必须显式设置。** |
| `ASSESS_RATE_HOURLY` | 否 | `10` | `/assess` 每匿名 ID / 每客户端 IP 的**每小时**评分上限，设 `0` 关闭该窗口。命中返回 `429` + `Retry-After`，且不触发付费 ASR。**注意这两个维度都由客户端掌控**（匿名 ID 无签名、可任意生成；IP 取自 `X-Forwarded-For` 请求头），只能挡住正常客户端和粗糙脚本。 |
| `ASSESS_RATE_DAILY` | 否 | `100` | 同上的**每日**上限，设 `0` 关闭该窗口。 |
| `ASSESS_RATE_GLOBAL_HOURLY` | 否 | `200` | **单实例**每小时的评分总次数上限，与调用方身份无关，设 `0` 关闭。这是唯一能真正给 ASR 支出封顶的一档；函数横向扩容时按热实例数倍增，故不要把它当作精确账单上限。 |
| `PRESIGN_RATE_HOURLY` | 否 | `60` | `/presign-upload` 与 `/dispose` **共用**的每匿名 ID / 每客户端 IP **每小时**上限，设 `0` 关闭该窗口。命中返回 `429` + `Retry-After`，且**不签发签名、不执行删除**。这两条路由同样匿名可达且都产生计费的存储请求，故也要限流；额度比评分宽松得多，因为重录一句是正常使用、成本是存储请求而非 ASR 秒数。与评分额度**分开计数**，所以反复重录不会吃掉评分配额。 |
| `PRESIGN_RATE_DAILY` | 否 | `600` | 同上的**每日**上限，设 `0` 关闭该窗口。 |
| `PRESIGN_RATE_GLOBAL_HOURLY` | 否 | `2000` | 同上的**单实例**每小时总次数上限，与调用方身份无关，设 `0` 关闭。与 `ASSESS_RATE_GLOBAL_HOURLY` 是各自独立的计数器。 |
| `OSS_PREFIX` | 否 | `sanguo` | 仅用于推导 `ASSESS_DATASET_BASE`（数据集与录音同 bucket、不同前缀）。 |

oss 后端下缺失任一 `OSS_*` 变量，进程启动即抛错并列出缺失项。

### 前端按钮判据（`assessAvailable`）

`POST /presign-upload` 的响应含 `assessAvailable`，判据为 **有 `DASHSCOPE_API_KEY` 且（oss 后端 或 `ASSESS_ASR=fake`）**。第二个条件不可省：local 后端的 presign 返回**相对路径** `/local-put/<key>`，交给远端 ASR 必然失败，只判凭据会让本地开发环境显示一个必然失败的按钮。前端仅在为 `true` 时渲染「評分」入口。

## 本地运行（无需云凭据）

```bash
cd server/recordings
RECORDINGS_LOCAL_DIR=/tmp/recfn PORT=8799 node server.mjs
# → recordings fn listening on :8799 (backend=local)
```

要连评分一起跑通（离线桩，不联网、不计费）：

```bash
cd server/recordings
RECORDINGS_LOCAL_DIR=/tmp/recfn PORT=8799 \
DASHSCOPE_API_KEY=test-key ASSESS_ASR=fake \
ASSESS_DATASET_BASE=http://localhost:5180/data \
node server.mjs
```

`ASSESS_DATASET_BASE` 指向 vite dev server 的 `/data` 中间件（映射仓库根的 `dist-assets/`），函数据此拉 `episodes/ep_<NNN>.json` 取参考文本；未生成 `dist-assets/` 时先按 `tools/deploy/DEPLOY.md` 跑一次 pipeline。

**手机真机走 LAN 验证时**（页面 origin 是 `http://<mac-ip>:5173`，不在内置白名单里），启动函数时把该 origin 加上，否则浏览器会因缺 `Access-Control-Allow-Origin` 而拦下所有调用（`curl` 不带 `Origin`，不受影响）：

```bash
RECORDINGS_LOCAL_DIR=/tmp/recfn PORT=8799 \
RECORDINGS_ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,http://192.168.1.20:5173" \
node server.mjs
```

冒烟：

```bash
ANON=11111111-1111-4111-8111-111111111111
# 1) 签发上传
curl -s -X POST localhost:8799/presign-upload \
  -H "X-Anon-Id: $ANON" -H 'Content-Type: application/json' \
  -d '{"episode":3,"entryId":"sg_003_010","durationSec":8,"mime":"audio/opus"}'
# → {"recId":"...","uploadUrl":"/local-put/recordings/<anon>/3_sg_003_010_<recId>.opus","key":"...","assessAvailable":false}
# 2) 上传（本地后端直接 PUT 到 uploadUrl）
curl -s -X PUT "localhost:8799<uploadUrl>" --data-binary @recording.opus
# 3) 评分（需 ASSESS_ASR=fake 或真实凭据）
curl -s -X POST localhost:8799/assess \
  -H "X-Anon-Id: $ANON" -H 'Content-Type: application/json' \
  -d '{"episode":3,"entryId":"sg_003_010","recId":"<recId>","ext":"opus"}'
# → {"score":100,"transcript":"...","languageWarning":false}
# 4) 删除
curl -s -X POST localhost:8799/dispose \
  -H "X-Anon-Id: $ANON" -H 'Content-Type: application/json' \
  -d '{"items":[{"episode":3,"entryId":"sg_003_010","recId":"<recId>","ext":"opus"}]}'
# → {"deleted":1}
```

## 测试

```bash
cd server/recordings
node --test          # 或 npm test
```

覆盖：OPTIONS/CORS、缺匿名头 403、超时长 413、presign 成功与 `assessAvailable` 各组合、local-put + dispose、跨 anon `deleted:0` 且对象保留、key 遍历（`..`）被拒、未知路由 404、错误方法 405；`/assess` 的参数校验 400、无凭据 503、跨 anon 与销毁后 404、不存在 list/download 路由；GET 签名的 stringToSign 与 verb 绑定；真实 ASR 客户端的请求体/鉴权头/base 拼接、数组内容拼接、缺凭据/无 URL/非 2xx/超时/网络失败/非 JSON 的错误映射；参考文本缓存/TTL/各类失败、返回 `jyutping`；字级相似度与 Python `difflib.SequenceMatcher` 已知结果对照；同音容错（同音不同字=100、忽略声调、不同音节不匹配、字典缺字回退、空粤拼回退）；字典加载与缺失/损坏降级；assess 同音与字级回退两路；限流（每小时/每日双窗口独立、达上限拒绝、滚动重置、被拒不延长锁定、`Retry-After` 取较小窗口、per-anon 与 per-IP 互不串扰、无身份不限流、handler 429 不计费不触数据集、单实例全局维度（轮换匿名 ID 与 IP 仍被拦、按小时滚动重置、不继承每日上限、无身份时也生效）、计数表硬上限与「淘汰不重置全局计数」）；语种检测（真实客户端从 annotations 取检测语种、fake 模式语种为空、非粤语 `zh` 置 `languageWarning` 且仍打分、粤语 `yue` 不告警、`isCantonese` 接受 `yue` 变体拒绝 `zh`/其他、`asrLang` 为 `auto`/空时请求体省略 `language` 提示、为 `yue` 时发送该提示）；CORS 白名单（名单内回显 + `Vary: Origin`、名单外与 `null`/仿冒子域一律不发 `allow-origin` 但请求本身仍对非浏览器调用方成功、env 覆盖与默认值解析、真实 socket 上验证）；`nosniff`；mime 原型键（`constructor`/`toString`/`__proto__`/`hasOwnProperty`）一律 400；oss 后端 `delete` 同样先做前缀断言（在触网之前）；`server.mjs` 入口的集成测试（真实起进程打 HTTP：2 MB 请求体 ⇒ `413` 且实例仍能服务下一个请求、正常请求体照常路由、白名单在真实 socket 上生效）；匿名 ID 大小写归一化（同一 ID 三种写法共用一份预算、对象 key 前缀取小写、改前录下的对象仍可销毁）、`/presign-upload` 与 `/dispose` 的 429（被拒时不签发签名、不执行删除）、对象操作预算与评分预算互不串扰、dispose 超 100 条整单 `400` 且不做部分删除、限流器按 `scope` 取预算且两份全局计数各自独立、`loadConfig` 在 `RECORDINGS_LOCAL_DIR` 与任一 `OSS_*` 凭据并存时启动即拒、`PRESIGN_RATE_*` 默认值与覆盖。合计 103 项。

## HTTP 接口

| 方法 & 路径 | 请求头 | 请求体 | 响应 |
| --- | --- | --- | --- |
| `OPTIONS *` | — | — | `204` + CORS 头（`allow-origin` 仅对白名单内 origin 发出） |
| `POST /presign-upload` | `X-Anon-Id`（UUID v4） | `{episode, entryId, durationSec, mime}` | `200 {recId, uploadUrl, key, assessAvailable}` / `403` 匿名头缺失或非法 / `400` 参数或 mime 非法 / `413` 超时长 / `429` 超过对象操作限流（附 `Retry-After`，**不签发签名**） |
| `POST /assess` | `X-Anon-Id`（UUID v4） | `{episode, entryId, recId, ext}` | `200 {score, transcript, languageWarning}` / `400` 参数非法 / `403` 匿名头缺失或非法 / `404` 本人前缀下命中不到对象（他人录音或已销毁）/ `429` 超过限流上限（附 `Retry-After`，不计费 ASR）/ `503` 评分不可用、数据集或 ASR 失败 |
| `POST /dispose` | `X-Anon-Id`（UUID v4） | `{items:[{episode, entryId, recId, ext}]}` | `200 {deleted}` / `400` `items` 超过 100 条（**整个请求拒绝，不做部分删除**）/ `403` 匿名头缺失或非法 / `429` 超过对象操作限流（附 `Retry-After`，**不执行任何删除**） |
| `PUT /local-put/<key>` | — | 原始音频字节 | **仅 local 后端**：`200 {ok:true}` / `403` key 不在前缀下；oss 后端不存在此路由 |
| 其他 | — | — | `404` 未知路由 / `405` 方法不允许 / `413` 请求体超过 1 MB |

校验规则：`episode` 为 1–999；`entryId` 匹配 `^[A-Za-z0-9_-]{1,64}$`；`recId` 匹配 `^[A-Za-z0-9-]{4,64}$`；`mime` 限于 `audio/opus`→`opus`、`audio/webm`→`webm`、`audio/webm;codecs=opus`→`webm`、`audio/mp4`→`m4a`；`/assess` 的 `ext` 限于上述 mime 映射出的扩展名。dispose 中任一条目不合法则跳过（不计入 `deleted`），但**条目数超过 100 条时整个请求回 `400`**——每条都是一次串行的鉴权删除，不能让单个匿名请求列出无界清单把实例占住；前端会把更长的清理拆成串行分片（`pagehide` 下只发一片，其余交给 lifecycle 兜底）。mime 映射表是**空原型**对象，故 `constructor`/`toString`/`__proto__` 这类原型键查不到、一律 `400`（普通对象字面量上它们会返回真值，从而带着一个函数当扩展名继续走下去）。请求体上限由 `server.mjs` 在进入路由前拦下（`MAX_BODY_BYTES`，1 MB）：超限即停止累积并回 `413`，避免单个客户端把实例内存撑爆。所有 JSON 响应带 `x-content-type-options: nosniff`——错误体会回显客户端提供的标识符。

匿名 ID **校验通过后统一转小写**再使用（校验本身仍是大小写不敏感的）：该值同时充当限流维度与对象 key 前缀，若不归一化，同一个 ID 换个字母大小写就算另一个身份——一个 UUID 约有 20 个十六进制字母，足以把每匿名 ID 的额度放大到形同虚设。合规客户端走 `crypto.randomUUID()` 生成的本就是小写，故归一化**不会让任何已存对象失联**。注意这并不使每匿名 ID 上限变成支出保证：唯一不受调用方掌控的仍是单实例全局档。

匿名 ID 是**标识符而非凭据**——它无签名、由客户端自持，唯一作用是把不同访客的录音隔开。因此它必须**不可猜**：前端只从 `crypto.randomUUID()`（或 `crypto.getRandomValues`）取值，**没有 `Math.random` 回退**；两者都不可用时录音功能整体关闭（`isRecordingSupported()` 返回 false，`postJson` 也拒绝发出请求），而不是退化成可预测的身份——可预测的 ID 等于对他人转写与删除路由的越权入口。

对象 key：`<RECORDINGS_PREFIX>/<anonId>/<episode>_<entryId>_<recId>.<ext>`。

## 评分内部流程

1. 校验匿名头与描述符，按 anon 前缀重建 key（客户端永远不传 key）。
2. 检查 `assessAvailable`，否则 `503`。
3. **限流**：按**单实例全局**（每小时）、**匿名 ID** 与**客户端 IP**（每小时 + 每日）三个维度固定窗口计数，命中任一上限 ⇒ `429` + `Retry-After`，**不触发付费 ASR 也不读取对象存储**；被拒的请求不推进自身计数窗口（否则重试会不断延长锁定）。全局维度是唯一不受调用方掌控的一档，也是唯一能真正给 ASR 支出封顶的。计数表带硬上限：超过 2 万个身份后先淘汰日窗口已翻转的，仍超限则淘汰最早插入的（全局计数键受保护、绝不淘汰），否则客户端不断换新匿名 ID 就能把实例内存撑爆。
4. `HEAD` 该 key（oss 后端）或 `fs.access`（local）：命中不到 ⇒ `404`，**不触发付费 ASR 调用**。
5. **先取参考文本**（公共数据集，内存缓存 10 分钟）：缺失/为空 ⇒ 直接失败，同样不付费；绝不用空参考算分（空参考会静默得出 0 分）。
6. 签发**仅 GET** 的短时签名 URL（TTL = `RECORDINGS_PRESIGN_TTL`）交给 ASR，函数不中转音频字节；`ASSESS_ASR=fake` 时跳过此步。
7. **同音容错打分（v1 以鼓励用户为主）**：把参考与转写都化成**去调粤拼音节序列**再比，同音字算匹配。参考侧粤拼取数据集 entry 自带的码点对齐 `jyutping` 数组（去调）；转写侧每个汉字经 `jyutping-dict.json`（`字→去调粤拼`）映射，字典查不到的字回退为该字本身。在该音节序列上求 Ratcliff/Obershelp 比率（`ratio = 2M/T`，语义同 Python `difflib.SequenceMatcher.ratio()`，本仓库零依赖故自实现），`score = round(100 * ratio)`。**忽略声调**是刻意的宽松口径。当参考无 `jyutping` 或字典未加载时**回退到字级比对**。字典由 `tools/pipeline/build_jyutping_dict.mjs` 从已发布的 `dist-assets/episodes/*.json` 生成（约 40KB，随函数打包），**数据集变更时须重新生成**。
8. **语种检测（提示性质）**：`asr_options.language` 只是提示、**不会拒绝其他语种**——普通话朗读照样被转写、并可能因字符/同音相似而得高分。故读取响应 `choices[0].message.annotations[].language`（`yue`=粤语、`zh`=普通话），当检测语种**存在且非粤语**时置 `languageWarning=true`。这是**警告而非拦截**：分数照常返回，前端另加一行「偵測到非粵語發音，建議用粵語朗讀」。检测语种缺失（离线 fake 模式、或响应无 annotations）时**不告警**，避免误伤。粤语判定见 `assess.mjs` 的 `isCantonese`（接受 `yue` 及 `yue-*`/`zh-yue` 变体）。
9. 返回 `{score, transcript, languageWarning}`；不写回任何对象。

成本控制：评分按需触发（前端不自动评分）、同一气泡在途请求单飞且成功即终态、单段 ≤60s，再加**服务端限流**（`ASSESS_RATE_HOURLY`/`ASSESS_RATE_DAILY`/`ASSESS_RATE_GLOBAL_HOURLY`）兜住绕过前端单飞直接调 `/assess` 的滥用。`/presign-upload` 与 `/dispose` 同样匿名可达且都产生计费的存储请求，故由**同一套限流机制的另一份独立预算**兜住（`PRESIGN_RATE_*`）；单次 dispose 另有 100 条上限。限流状态在单实例进程内，无服务器多实例下为**尽力而为的速度带而非精确配额**，硬上限仍由云端预算告警兜底；设计取舍见 change `design.md` 的 D10。

**未收口的成本面（已知限制）**：上传体积没有上限。`RECORDINGS_MAX_DURATION` 只校验客户端在 presign 请求里**自报**的 `durationSec`，而真正的音频是浏览器拿签名 URL **直传 OSS、不经函数**，OSS V1 的 presigned PUT 无法限制 `Content-Length`。因此匿名调用方可以声明 3 秒却上传任意大小的对象，唯一兜底是 `recordings/` 前缀的 lifecycle 过期删除（务必确认该规则真的生效）。要真正封住需把签名方式换成 `PostObject` + policy 的 `content-length-range`，属设计变更，未实施。

## CORS

`corsHeaders` 按白名单发头，**不回显任意 `Origin`**：

- `access-control-allow-origin`：仅当请求 `Origin` 命中 `cfg.allowedOrigins`（来自 `RECORDINGS_ALLOWED_ORIGINS`，见环境变量表）时才回显该 origin；否则**整个头不发**，浏览器随后拦截响应。非浏览器调用方（curl、服务端）不带 `Origin`，不受影响。
- `vary: Origin`：只要有 `Origin` 就带上，避免共享缓存把某个 origin 的应答发给另一个 origin。
- `access-control-allow-headers`：`X-Anon-Id, Content-Type`
- `access-control-allow-methods`：`POST, PUT, OPTIONS`
- `access-control-max-age`：`600`

之所以必须白名单：FC 触发器那一层会**自行附加** `Access-Control-Allow-Credentials: true`（不是本仓库代码设的）。"反射具体 origin + 允许携带凭据" 是 CORS 里最危险的组合，任意站点都能跨域读到响应；改成白名单后，非名单 origin 拿不到 `allow-origin`，那一层附加的凭据头也就无从生效。**FC 触发器自身的 CORS 配置仍应在控制台收窄到站点域名并关掉 allow-credentials**，两侧都改才算收口。

前端跨域调用 presign-upload / assess / dispose 与直传 OSS 时依赖上述头。若在 OSS 侧直传，另需在 bucket 上配置对应的 CORS 规则（允许 `PUT`、来源为站点域名、`Allowed Header` 含 `*`）。评分取回音频走**服务端签名的 GET URL**（由 ASR 服务直接访问，不经浏览器），因此不需要为 GET 放宽 bucket CORS。

## RAM 授权

录音上传/销毁只需 `recordings/*` 前缀的 `oss:PutObject` 与 `oss:DeleteObject`；**评分额外需要同一前缀的 `oss:GetObject`**（用于 `HEAD` 存在性检查与签名 GET）。授权范围仍限本人前缀、**不含 `oss:ListObjects`**，权限面保持最小。

## OSS lifecycle（7 天兜底自清）

销毁以客户端删除为主（重试 + `pagehide` keepalive），但页面崩溃/断网可能漏删。为 `recordings/` 前缀配置生命周期规则兜底，防孤儿对象长期驻留：

- 作用前缀：`recordings/`（与 `RECORDINGS_PREFIX` 一致）
- 规则：对象最后修改时间 **7 天**后自动删除
- 配置途径：OSS 控制台 → bucket → 基础设置 → 生命周期，或 `ossutil lifecycle --method put`

因无 list/download 接口，孤儿对象无法被任何接口枚举，隐私风险可控；lifecycle 确保其最终被清除。

## 部署

见 `tools/deploy/DEPLOY.md` 的「录音函数」小节（部署命令、写入上述环境变量、回滚方式）。
