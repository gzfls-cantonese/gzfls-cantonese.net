# Proposal

## Why

录音闭环目前只完成「跟读 — 回听」，缺少「纠正」的客观反馈：访客回听自己的录音后仍不知道自己读得准不准、与原文差多少。上一变更已建立匿名上传与私有存储，且对象命名含 `<episode>_<entryId>_<recId>`，服务端可按 span 取回本人原声——评分的前置条件已就绪。本变更补上「简易粤语发音评分」，把学习闭环补完，并以阿里云函数计算 + AI 框架（DashScope 粤语 ASR）实现，避免在浏览器端做重计算。

## What Changes

- 新增**按需评分入口与回显**：录音气泡在上传完成后出现「评分」按钮；点击后请求评分，分数（0–100）与 ASR 转写回显在气泡上。不自动评分（控制 AI 调用成本），由访客主动触发。
- 新增**服务端评分端点**：在现有 recordings 函数内新增 `POST /assess`。沿用 `X-Anon-Id` 归属模型——对象 key 由服务端按该 anon 前缀重建后读取，仅能读取本人对象；MUST NOT 新增录音列表或下载接口。评分为无状态单次计算，结果不写回 OSS。
- 新增**AI 框架接入（粤语 ASR）**：服务端接入阿里云百炼**国际站**粤语语音识别，默认模型 `qwen3-asr-flash`（**同步调用**、粤语语言码 `yue`、单文件 ≤5 分钟且 ≤10 MB），把本人录音转写为文本；与该 span 的参考繁体文本（数据集 `transcription`）做字级相似度，映射为 0–100 分。ASR 凭据与 endpoint 经环境变量注入；无凭据时评分端点返回明确「不可用」，前端隐藏/禁用评分按钮。
- 新增**失败回退**：ASR 不可用、超时或转写为空时返回可理解错误，气泡显示失败提示；不影响本地回放、上传、销毁等既有行为。
- 不改动既有录音上传/销毁/并发隔离行为；不改动数据集连续播放与脚本同步高亮。

## Capabilities

### New Capabilities

- `reading-assessment`: 按需触发评分、服务端按归属取回本人录音、粤语 ASR 转写、与参考文本字级相似度评分、分数与转写在气泡回显、归属隔离与失败回退的行为契约。

### Modified Capabilities

（无。`user-recording` 仍在上一变更中未同步入主 specs，本变更不修改其需求；气泡上的评分入口与回显作为 `reading-assessment` 的新需求描述。）

## Impact

- 服务端：`server/recordings/` 新增 `/assess` 路由、DashScope ASR 客户端与文本相似度模块；`oss.mjs` 需新增 presigned **GET** 签名能力（现仅有 PUT 与 authenticated DELETE）；新增环境变量（`DASHSCOPE_API_KEY`、`ASSESS_ASR_BASE`、`ASSESS_ASR_MODEL`、`ASSESS_ASR_LANG`、可选 `ASSESS_DATASET_BASE`、本地/e2e 用 `ASSESS_ASR=fake`）；RAM 授权需在本人 `recordings/` 前缀上由 put/delete 扩展为含 `oss:GetObject`（仅本人前缀，仍无 list）。
- 前端：`web/src/ui/TrialRecorder.tsx` 与 `web/src/data/useTrialRecord.ts` 为气泡增加「评分」按钮、loading、分数/转写回显与失败态；`web/src/data/recordings.ts` 增加 assess 客户端与客户端超时。无新增前端运行时依赖。
- 依赖：服务端新增对百炼国际站的纯 HTTP 调用（避免重 SDK 依赖）；浏览器端无新依赖。
- 成本：每次评分产生一次 ASR 调用；按需触发 + 单段时长上限（≤60s）控制成本。**v1 已加服务端限流**（per-anon + per-IP、每小时 + 每日双固定窗口，超限 429 + `Retry-After` 且不计费），兜住绕过前端单飞直接调 `/assess` 的滥用；限流状态在单实例进程内、多实例下为尽力而为，硬上限仍靠云端预算告警（详见 design 的 D10）。
- 部署：站点与 OSS 在**国际站香港地域**，而百炼国际站服务地域为**新加坡 `ap-southeast-1`**（香港无此服务），须按地域开通并使用地域级 API Key，计费独立于中国站；函数环境变量、RAM 权限与函数超时需相应更新；`tools/deploy/DEPLOY.md` 增补评分相关配置。
- 隐私与合规：评分仅读取本人对象；转写与分数仅会话内回显、不持久化；录音保留期 lifecycle 与销毁语义不变。**评分会把访客录音交给第三方 AI 服务处理，改变了上一变更「仅本地回放、他人不可读」的隐私姿态**；已在前端告知——单集录音区文案改为「當前小節試講和AI評分」，其下下划线链接「錄音和AI評分隱私處理聲明」指向新页面 `/recording-privacy`（详见 design 的 D11）。
