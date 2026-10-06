# Design

## Context

站点为纯静态前端（React + Vite，OSS 静态托管）+ 稳定数据前缀 `<PREFIX>/data/`（见主 spec `deploy-layout`），无任何服务端组件与用户体系。单集页（`web/src/ui/EpisodePage.tsx`）持有数据集播放器与脚本面板（`ScriptPanel.tsx`，虚拟列表、行 key 为 entry id、当前行高亮），天然给出「当前 span（单段 entry）」的稳定标识与暂停入口。动机见 proposal.md（Why），行为契约见 `specs/user-recording/spec.md`。

约束：微信语音对话式交互（长按录、松开停、气泡回听）；录音仅本地回放、离开即销毁；不引入账号/个人信息；复用现有 OSS 与部署凭据体系。

## Goals / Non-Goals

**Goals:**

- 以微信语音的熟悉交互提供单段试讲：长按录音、松开即停、气泡回听，零学习成本。
- 最小服务端面积：仅签名上传与删除两操作；录音不上任何公开面。
- 隐私默认安全：本地仅会话内存、离开即销毁（含重试与卸载兜底）、服务端保留期自清。

**Non-Goals:**

- 「发音评分」能力本身（按钮注释文案先行，评分服务另立变更）。
- 录音的跨会话/跨设备保留、列表管理界面、公开分享或社区功能。
- 录音转码、降噪、语音识别；账号体系与登录。

## Decisions

### 1. 交互模型：长按状态机 + 播放条并列录音按钮

录音入口为单集播放条内、与「播放/暂停」同等大小且左右平行并列的圆形按钮（播放条不再提供前进/后退按钮）。录音按钮为与播放按钮同色系的轮廓描边 + 白色底纹 + 麦克风图标，下方浅灰小字注释「錄音和AI評分」；播放按钮保持实心品牌渐变。交互用 Pointer Events 统一鼠标/触摸：`pointerdown` 进入 holding（请求麦克风、开始 MediaRecorder、暂停数据集播放、显示文字框「你就係楷叔，快滴講尼段古仔吧」）；`pointerup`/`pointercancel` 停止录音并退出文字框。移动端抑制长按副作用：`touch-action: none`、`-webkit-touch-callout: none`、拦截 `contextmenu`。
状态机：`idle → holding(录音中) → recorded(气泡+后台上传) → disposed`；同段重录回到 holding 并在松开时覆盖旧录音。
**替代**：点按开始/再点停止（与微信习惯不符、易误触遗留录音，否决）；行级小按钮（上一版方案，被微信式需求取代）。

### 2. 采集：MediaRecorder + mime 回退链 + 时长上限

mimeType 依支持度取 `audio/opus` → `audio/webm;codecs=opus` → `audio/mp4`；单段上限默认 60s 自动停止（等同松开）。不支持或拒授权时按钮置灰并提示，既有功能不受影响。
**替代**：WAV/PCM（体积大 10 倍以上，否决）。

### 3. 本地缓存：仅会话内存

录音 Blob 与 `URL.createObjectURL` 仅存于内存（hook 状态），**不写 IndexedDB/localStorage/磁盘**：刷新即失，天然满足隐私意图且销毁只需 revoke + 释放引用。气泡数据（span、时长、Blob 引用）同存内存。
**替代**：IndexedDB 持久缓存（与「退出即销毁」意图冲突且增加清理面，否决）。

### 4. 后台上传与销毁保证链

松开后即入上传队列：`POST /presign-upload` → PUT 对象 → 完成标记；失败指数退避重试（上限 3 次），重试不阻塞 UI、不影响本地回放。销毁（点击播放 / 选集回主页 / 路由切换 / pagehide）执行：revoke ObjectURL、清空状态、移除气泡、对每条已上传或上传中的录音调用 `POST /dispose`（上传中则先 abort 再 dispose）；dispose 失败重试；`pagehide` 用 `fetch(..., {keepalive:true})` 发卸载安全请求；服务端对 `recordings/` 前缀配置 lifecycle（默认 7 天）兜底自清。三层保证满足 spec「必须确保删除」。
**替代**：仅客户端删除（关页/断网即泄漏，不满足 spec，否决）；sendBeacon（仅支持 POST 且 body 受限，keepalive fetch 更通用）。

### 5. 存储布局：单对象、key 自描述、私有前缀

私有前缀 `recordings/<anonId>/<episode>_<entryId>_<recId>.<ext>`，**每条录音仅一个对象**（无 meta json：无列表接口，元数据由客户端内存持有；创建时间存对象 x-oss-meta 供 lifecycle/审计）。归属校验 = 函数内强制 key 前缀等于请求头 `X-Anon-Id`，客户端无法传完整 key。同段重录覆盖 = 新 recId 上传成功后 dispose 旧 recId。
**并发隔离**：`<anonId>` 为 key 的第一段前缀，天然把不同匿名会话的对象分隔在各自命名空间下；多个会话并发上传/覆盖/删除时，服务端只按请求头 anon 重建 key，任一请求都无法命中他人前缀，故并发会话相互隔离、互不可寻址（对应 spec「并发匿名会话隔离」）。`<recId>` 含时间戳与随机位，避免同 anon 同 span 的并发/重录产生 key 碰撞。
**替代**：音频+meta 双对象（上一版方案；无列表接口后 meta 无消费者，简化为单对象）。

### 6. 服务端：单函数两操作

Aliyun FC HTTP 函数：`POST /presign-upload` {episode, entryId, durationSec, mime} → {recId, uploadUrl, key}（校验匿名头格式、时长上限、mime 白名单）；`POST /dispose` {items:[{episode, entryId, recId, ext}]} → {deleted}。dispose 需完整描述符而非仅 recId：key 由 `<episode>_<entryId>_<recId>.<ext>` 拼成，服务端无 list 接口，仅凭 recId 无法反查 key，故由客户端回传四元组、服务端在请求头 anon 前缀下重建 key 后删除。跨 anon 的 dispose 因前缀不匹配而命中不到对象（`deleted:0`），而非 403——客户端本就无法寻址他人 key。MUST NOT 实现 list/download。环境变量仅 OSS 凭据（建议仅 `recordings/` 前缀 put/delete 权限的 RAM 子账号）。
**替代**：含 list/download 的四操作函数（上一版；本地回放后无消费者，缩小攻击面，否决）。

### 7. 前端集成与互斥

- 新增 `recorder.ts`（能力检测、mime 回退、长按会话封装）、`recordings.ts`（anonId、presign-upload/dispose 客户端、上传队列）、`useTrialRecord(episode, span)` hook（状态机 + 气泡数据 + 销毁注册）。
- `EpisodePage` 将录音按钮作为 `recordSlot` 传入 `PlayerBar`，与播放按钮并列渲染；文字框与气泡为 fixed 覆盖层（气泡居中浮于播放条上方），并在「播放」点击与路由离开处挂销毁钩子（React Router 离开用组件卸载 + `useBlocker` 不需要：卸载即销毁；「选集」链接点击触发卸载）。
- 互斥：holding 开始即 pause 数据集播放器；回放气泡时 pause 数据集；数据集 play 事件触发销毁（spec 要求点击播放即销毁）。
- Feature flag：`VITE_RECORDINGS_API` 未设置时整套 UI 不渲染（兼回滚开关）。

## Risks / Trade-offs

- [微信内置浏览器/移动端长按触发系统菜单或滚动] → `touch-action:none` + 拦截 `contextmenu` + `pointercancel` 视为松开；不支持 MediaRecorder 时隐藏入口并提示用系统浏览器。
- [pagehide keepalive 请求被浏览器丢弃] → dispose 重试 + lifecycle 7 天兜底；spec 已把兜底写入契约。
- [匿名 ID 被清除即失去 dispose 能力（孤儿对象）] → lifecycle 兜底清除；孤儿对象不可被任何接口枚举（无 list），隐私风险可控。
- [上传中离开页面留下半截对象] → 上传以 PUT 完成后才视为存在；半截对象同样由 lifecycle 清除且不可枚举。
- [长按与脚本面板滚动手势冲突] → 录音按钮位于吸底播放条内、不覆盖脚本滚动区；按钮自身 `touch-action: none` 使长按手势不触发页面滚动或系统菜单。
- [函数冷启动延迟首条 presign] → 操作轻量可接受；不预留实例。

## Migration Plan

1. OSS：私有前缀 `recordings/`、lifecycle 7 天规则、站点域 CORS（PUT/POST/DELETE + 必要头）。
2. 部署函数（env：OSS endpoint/bucket/子账号凭据、时长上限）。
3. 发布站点注入 `VITE_RECORDINGS_API`；未注入的构建不含录音 UI。
4. 回滚：发布不含该 env 的站点或下线函数触发器；存量对象由 lifecycle 到期自清，无存量数据迁移。

## Open Questions

- 保留期天数与单段时长上限的具体数值以函数配置定（默认 7 天 / 60s），实施时可按成本与体验微调，不影响 spec 与任务拆分。
