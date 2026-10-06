# Design

## Context

现有 `server/recordings/` 是一个零依赖 Node HTTP 函数：`POST /presign-upload`、`POST /dispose`、（local 后端）`PUT /local-put/<key>`；匿名 ID 仅经 `X-Anon-Id` 头传入，对象 key 恒为 `<prefix>/<anon>/<episode>_<entryId>_<recId>.<ext>`，由服务端重建，客户端无法寻址他人对象。对象存于 OSS 私有前缀 `recordings/`。`server/recordings/oss.mjs` 目前**只有 presigned PUT 与 authenticated DELETE，没有 GET 签名能力**，评分需新增。数据集为公共读静态制品，单集索引位于 `<data>/episodes/ep_<NNN>.json`，其中 `entries[].transcription` 即该 span 的参考繁体文本。前端气泡由 `TrialRecorder` 渲染、状态在 `useTrialRecord`。See proposal.md — Why。

**部署地域约束（已核实）**：站点与 OSS bucket 在**阿里云国际站香港地域**（`oss-cn-hongkong`，见 `tools/deploy/DEPLOY.md`）。阿里云百炼（Model Studio）国际站**必须按地域开通**，可用服务地域为**新加坡 `ap-southeast-1`**（另有美东弗吉尼亚），**香港无此服务**；API Key 是地域级凭据，计费与中国站完全独立（按分钟出账、按月结算）。因此函数在香港、ASR 在新加坡，跨地域公网一跳（延迟可忽略）。国际站粤语 ASR 事实：`qwen3-asr-flash` **同步调用**、粤语语言码为 `yue`、单文件 ≤5 分钟且 ≤10 MB、接受公网可达 URL（官方建议托管在 OSS 且直接访问返回 200）；带 `-filetrans` 后缀的变体与 `paraformer-v2` 录音文件识别**只支持异步**（提交 `task_id` 后轮询）。官方文档只点名 AAC/WAV/MP3 等「主流格式」，**未明确列出 webm/opus**——而本项目浏览器 `MediaRecorder` 实际产出 `.webm`（Chrome/Edge，`audio/webm;codecs=opus`）与 `.m4a`（Safari，`audio/mp4`），格式可用性必须先实测（见 D9）。

## Goals / Non-Goals

**Goals:**
- 在现有函数内以最小面新增评分能力：一个 `POST /assess` 端点 + 一个 DashScope ASR 客户端 + 一个同音容错（去调粤拼音节级）相似度函数。
- 评分严格沿用 anon 归属隔离：仅读取本人前缀对象；不新增 list/download。
- 按需触发、无状态、不写回；失败与「未配置凭据」都有明确、可见的回退。
- 本地（local 后端 / 无凭据）可跑通开发与 e2e（stub ASR），不依赖云。

**Non-Goals:**
- 不做音素级/声学级发音诊断、不做逐字高亮纠错（v1 只给单一 0–100 分 + 转写）。
- 默认不做繁简归一、不做评分结果持久化或历史榜。（繁简归一是**条件性例外**：若 D9 实测发现粤语 ASR 输出为简体，则纳入本变更，否则维持不做。）
- 不改动上传/销毁/并发隔离与数据集播放行为。

## Decisions

**D1 — 评分端点并入现有 recordings 函数，而非新函数。**
新增 `POST /assess`，复用同一 CORS、同一 `X-Anon-Id` 归属模型与同一部署面。替代方案：独立评分函数——会增加一套部署/env/CORS 面，与「最小接口」初衷相悖，否决。

**D2 — 取回本人录音用「短时 presigned GET URL」交给 DashScope，函数不中转音频字节。**
`oss.mjs` 新增 `presignGetUrl`（V1 签名，verb=GET，空 content-md5/content-type，与现有 `presignPutUrl` 同构），服务端以本人 anon 重建 key 后签发**仅 GET** 的签名 URL，作为 ASR 的音频入参。对象保持私有；函数不承担音频上传/下载带宽与延迟。官方文档明确要求「文件托管在 OSS 且直接访问返回 HTTP 200」，签名 GET 正好满足。**TTL 复用 `RECORDINGS_PRESIGN_TTL`（默认 300s），不用更短的值**：即便选用同步模型，签名 URL 也要在请求内被远端取走，过短的 TTL 会把「远端稍慢」变成不可解释的失败；300s 仍是仅 GET、仅本人单对象，且 `/dispose` 删除对象后 URL 自然 404，暴露面不变。替代方案：函数内 authenticated GET 再把字节传给 ASR——多一跳带宽与内存占用，否决。

**D3 — ASR 默认 `qwen3-asr-flash`（同步调用），走 REST（无 SDK），模型/base/语言均经 env 可配。**
选同步模型是关键取舍：`qwen3-asr-flash` 支持同步调用（OpenAI 兼容 `/compatible-mode/v1/chat/completions` 或 DashScope 同步），粤语经 `language=yue` 指定，单文件 ≤5 分钟且 ≤10 MB——本项目单段 ≤60s、opus/webm 仅数百 KB，余量充足。同步意味着**不需要提交任务 + 轮询**，`/assess` 一次请求内返回，函数超时不必特意上调，实现与失败语义都更简单。带 `-filetrans` 的变体与 `paraformer-v2` 录音文件识别只支持异步，需在一次请求内轮询到出结果、并据此抬高函数超时，复杂度与超时风险都更高，故**不作为默认**（保留为可切换项：`ASSESS_ASR_MODEL` 覆盖）。env：`ASSESS_ASR_BASE`（国际站 endpoint，控制台可能给 `https://dashscope-intl.aliyuncs.com` 或按工作空间隔离的 `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`，**以控制台实际值为准，故必须可配**）、`ASSESS_ASR_MODEL`（默认 `qwen3-asr-flash`）、`ASSESS_ASR_LANG`（默认 `yue`）。选 REST 而非 SDK：保持函数零/轻依赖、与现有 oss.mjs 手写签名的风格一致。仍需设**请求超时**（如 20s），超时按失败回退。替代方案：函数内跑 whisper——依赖重、冷启动慢，否决。

**D4 — 参考文本由服务端从公共数据集前缀拉取，而非客户端传入。**
按 `episode` 拉 `<data>/episodes/ep_<NNN>.json`，按 `entryId` 取 `transcription` 作为参考。客户端传参考文本可被篡改且易与数据集不一致，否决。`ASSESS_DATASET_BASE` **可选**，未设置时从既有 OSS 配置推导为 `https://<OSS_BUCKET>.<OSS_ENDPOINT>/<OSS_PREFIX>/data`（数据集与录音同 bucket，见 `tools/deploy/DEPLOY.md` 布局），避免新增必填 env。拉取需带超时；**拉取失败或参考文本为空时返回 503，绝不用空参考算分**（空参考会静默得出 0 分）。数据集按构建不可变，缓存 TTL 可长（如 10 分钟）。

**D5 — 相似度 = 归一后「去调粤拼音节级」Ratcliff/Obershelp ratio → 0–100（同音容错）。**
v1 打分以**鼓励用户**为主：不是逐汉字硬比，而是把参考与转写都化成**去掉声调的粤拼音节序列**再比，于是「同音字」自然算匹配（如 ASR 把「詩 si1」听成「史 si」仍满分）。参考侧粤拼直接取数据集 entry 自带的**码点对齐 `jyutping` 数组**；转写侧的每个汉字经一份 `字→去调粤拼` 字典映射，字典里查不到的字**回退为该字本身**（仍能与相同参考字匹配，但不再同音匹配）——这是「字典从数据集词表派生」的既定代价。字典由 `tools/pipeline/build_jyutping_dict.mjs` 扫描已发布的 `dist-assets/episodes/*.json` 生成（3935 字、去调后 0 冲突、约 40KB），提交为 `server/recordings/jyutping-dict.json` 随函数打包，**零运行时依赖、无网络**；数据集变更时重新生成。**忽略声调**是刻意的宽松口径（用户选定），代价是仅声调不同的近音字会被判为匹配。**Node 没有内置 `SequenceMatcher`，零依赖约束也排除 npm difflib**，故在 `similarity.mjs` 内自实现 Ratcliff/Obershelp（递归最长公共块，`ratio = 2M/T`），语义与 Python `difflib.SequenceMatcher.ratio()` 一致、可单测。`scoreReadingHomophone(reference, refJyutping, transcript, dict)` 返回 `{score, transcript}`；当参考无 `jyutping` 或字典未加载时，`assess.mjs` **回退到字级 `scoreReading`**。无状态、不写回 OSS。

**D6 — 「是否可评分」由 presign 响应前置告知，前端据此显示/隐藏按钮。**
`POST /presign-upload` 响应新增 `assessAvailable: boolean`，判据为 **`有 ASR 凭据 && (backend === 'oss' || ASSESS_ASR === 'fake')`**——不能只看凭据：local 后端的 presign 返回的是**相对路径** `/local-put/<key>`（见 `backend.mjs`），交给远端 ASR 必然失败，若只判凭据会让本地开发环境显示一个必然失败的按钮。前端仅在为 true 时渲染气泡「评分」入口；为 false 时隐藏（即回滚开关）。运行期 ASR 失败则返回 503 + 可理解错误，气泡显示失败提示。

**D7 — 成本控制：按需触发 + 前端单飞 + 时长上限 + 服务端限流。**
不自动评分；前端对同一气泡的在途评分请求单飞（不并发重复）；单段 ≤60s（沿用 `RECORDINGS_MAX_DURATION`）。服务端无状态、重算幂等。**v1 已含服务端限流（见 D10）**：前端单飞可被直接调 `/assess` 绕过，而这是本项目第一个「每次调用都花第三方钱」的端点，故除按需触发外再加进程内固定窗口限流兜底滥用。

**D10 — 服务端评分限流：per-anon + per-IP 双维度、每小时 + 每日双固定窗口（用户 2026-10-06 定案）。**
`ratelimit.mjs` 的 `createRateLimiter(cfg, {now})` 以 `Map` 按 `'a:'+anon` / `'i:'+ip` 计数，每小时（`ASSESS_RATE_HOURLY` 默认 10）与每日（`ASSESS_RATE_DAILY` 默认 100）各一固定窗口，阈值设 0 关该窗；请求仅在**所有**适用计数都未达上限时放行，随后各计数 +1；命中上限返回 429 + `Retry-After`（取最早到期窗口的秒数），**被拒不推进计数**（否则被拒客户端的重试会不断延长自身锁定）。在 `handler.mjs` 的 `/assess` 分支置于 anon 校验与 `assessAvailable` 判定之后、`backend.exists` 之前，故被拒请求不触达对象存储、不计费 ASR。客户端 IP 取 `X-Forwarded-For` 首跳回退 `X-Real-IP`，无 IP 时仅按 anon 限（local dev 友好）。**权衡**：状态在单实例进程内，无服务器多实例下为尽力而为的速度带而非精确配额——目标是抑制廉价滥用，不是硬性账单上限；硬上限仍由云端预算告警兜底。超 `MAX_ENTRIES`（20000）时清扫日窗已过期的条目以约束内存。

**D11 — 隐私告知与文案（用户 2026-10-06 定案）。**
单集录音区提示文案由「录音和AI评分」改为「當前小節試講和AI評分」（字体不变），其下新增下划线链接「錄音和AI評分隱私處理聲明」，指向新页面 `/recording-privacy`，页面说明收集范围（仅录音与匿名 ID）、匿名隔离存放、退出即销毁 + 生命周期兜底、评分向第三方 AI 提供短时效只读链接且分数/转写不持久化、参考文本 CC0、联系方式。此文案取代 Open Questions 里「一次性告知」的悬而未决项。

**D8 — local 后端 / 无凭据的可测性：stub ASR。**
local 后端无法提供公网音频 URL；无 `DASHSCOPE_API_KEY` 时 `/assess` 返回 503 unavailable。开发/e2e 可设 `ASSESS_ASR=fake` 使用确定性 stub 转写，使整条链路（按钮→请求→回显）离线可测。

**D9 — 格式与繁简实测是实现前置门槛（spike gate），不是实现细节。**
在写 ASR 客户端之前，先用真实浏览器录出的 `.webm`（Chrome/Edge）与 `.m4a`（Safari）各跑一次真实调用，确认三件事：(a) 容器/编码被接受（官方文档只点名 AAC/WAV/MP3 等主流格式，未列 webm/opus）；(b) 粤语转写质量可用；(c) **输出是繁体还是简体**——参考文本是繁体而 D5 不做繁简归一，若输出简体则分数被系统性低估，需把繁简归一从「后续迭代」提前到本变更。若 (a) 不成立，D2「函数不中转音频字节」即失效，须改设计（前端改录 WAV，或函数内转码），属于设计级变更而非实现调整，**必须先回到本文件修订再继续实现**。

**D12 — 非粤语朗读：检测 + 提示，不拦截（用户 2026-10-07 定案，线上 bug 修复）。**
线上发现「普通话朗读仍得 100 分」。核实官方 API：`qwen3-asr-flash` 的 `asr_options.language` **仅为提示、不拒绝其他语种**，也没有 `enable_lid` 之类硬开关——即「强制 ASR 只识别粤语」在参数层做不到。同音容错打分基于字符/音节，普通话朗读被 ASR 转成相同汉字后自然高分，这是 D5 宽松口径的必然副作用。可用抓手是响应里的**检测语种** `choices[0].message.annotations[].language`（`yue`=粤语、`zh`=普通话）。
- **决策**：读检测语种，非粤语时**照常返回分数**，另置 `languageWarning:true`，前端在分数旁加一行「偵測到非粵語發音，建議用粵語朗讀」。用户明确选「照常评分但标注警告」（而非拒绝或判 0），保留鼓励取向。
- **判定口径**：`isCantonese` 接受 `yue` 及 `yue-*`/`zh-yue` 变体（用户选「yue 及粤语相关码」）；检测语种缺失（fake 桩、响应无 annotations）时**不告警**，避免误伤粤语用户。
- **可切换**：若日后要更严（普通话直接不给分），只需把 `assess.mjs` 里的告警改成拦截返回，接口与前端结构不变。
- **局限**：检测语种由 ASR 给出、准确性以其为准；此为尽力而为的提示，非发音质量的严格判定。真机核验用 `tools/spike-asr.mjs`（已打印检测语种）读普通话/粤语各一段确认 `zh`/`yue` 如期返回（并入 5.2 冒烟）。

## Risks / Trade-offs

- [**音频容器格式未被官方文档确认（webm/opus）** → 可能导致 D2/D3 方案整体失效] → D9 spike 前置实测；不通过则回本文件改设计，不带病实现。
- [ASR 输出繁简与参考繁体不一致 → 分数被低估] → D9 实测确认；v1 先接受为近似指标并在回显附转写供人工对照；若实测为简体输出，则把繁简归一纳入本变更范围。
- [**评分把访客声音交给第三方 AI 处理，改变了既有隐私姿态**（上一变更的承诺是「仅本地回放、退出即销毁、他人不可读」）] → 记为已知姿态变更；分数与转写仍不持久化、退出即销毁语义不变；**已按 D11 在录音区提供隐私声明页入口（下划线链接「錄音和AI評分隱私處理聲明」→ `/recording-privacy`）向访客明确告知**。
- [**服务端滥用防护，`/assess` 可被绕过前端直接刷** → 第三方账单膨胀] → 已按 D10 加 per-anon + per-IP、每小时 + 每日双固定窗口限流（429 + Retry-After，被拒不计费）；单价极低（paraformer 量级约 ¥0.00008/秒，单次评分远低于一分钱），限流为尽力而为的速度带，硬上限仍由云端预算告警兜底。
- [DashScope 延迟/超时] → 同步模型 + 请求超时（≈20s）；前端 loading 态 + 客户端超时（`AbortSignal.timeout`，≈30s）+ 失败提示；超时按失败回退（D6/规格「评分失败回退」）。
- [presigned GET URL 交给第三方] → TTL 300s、仅 GET、仅本人单对象；DashScope 为受信云服务；URL 不写日志；对象销毁后 URL 自然失效。
- [跨地域（函数在 HK、ASR 在新加坡）与按地域开通错配] → base URL 经 `ASSESS_ASR_BASE` 可配；API Key 为地域级凭据，配错地域会 401，部署文档明确标注须在新加坡地域开通与取 Key。
- [RAM 权限需扩展] → 评分需在本人 `recordings/` 前缀上加 `oss:GetObject`；保持仅本人前缀、无 list，权限面仍最小。
- [local/无凭据环境按钮行为] → `assessAvailable` 同时要求 oss 后端或 fake 模式（D6），避免显示必然失败的按钮。

## Migration Plan

1. **采购/授权前置（可与实现并行，不依赖代码）**：国际站账号在**新加坡地域**开通 Model Studio → 创建地域级 API Key → 设月度预算告警；RAM 子账号在 `recordings/*` 前缀加 `oss:GetObject`。
2. 部署函数新版本（含 `/assess`）；**不注入 `DASHSCOPE_API_KEY` 时 `assessAvailable=false`，界面与现状一致（安全回滚点）**。
3. 注入 `DASHSCOPE_API_KEY`、`ASSESS_ASR_BASE`（+ 可选 `ASSESS_ASR_MODEL`、`ASSESS_ASR_LANG`、`ASSESS_DATASET_BASE`）→ 评分入口出现。
4. 回滚：移除 `DASHSCOPE_API_KEY` 或回退函数版本即可整体下线评分，录音上传/销毁不受影响。

## Open Questions

- ~~**是否在「评分」入口旁展示一次性告知文案**~~ **已定案（2026-10-06，见 D11）**：录音区文案改「當前小節試講和AI評分」，其下下划线链接「錄音和AI評分隱私處理聲明」指向新页面 `/recording-privacy`。
- ~~**是否加服务端每 anon 的评分限流**~~ **已定案（2026-10-06，见 D10）**：per-anon + per-IP 双维度、每小时 + 每日双固定窗口，429 + Retry-After，进程内尽力而为。
- `qwen3-asr-flash` 同步调用的确切请求体字段（音频以 URL 传入的 content 结构、`language`/`asr_options` 位置）与 `ASSESS_ASR_BASE` 的具体形态（`dashscope-intl` 还是 `{WorkspaceId}.ap-southeast-1.maas`）——以控制台与官方 API 文档为准，D9 spike 时一并敲定。
- 是否对同一 `recId` 做短时间内存缓存以省重复调用——v1 不做，观察成本后再定。
