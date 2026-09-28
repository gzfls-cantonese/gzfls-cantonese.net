# Design

## Context

动机见 proposal.md - Why。当前仓库为空站点骨架：仅有 `CanCLID/zoengjyutgaai/` 下 5 个 parquet（共 39,173 条、157 集、约 2.6 GB OPUS 音频）、OpenSpec 目录与 MIT LICENSE，无任何前后端代码。

已核实的数据事实（决定架构）：
- 每条记录字段：`id`(如 `sg_001_001`)、`episode_id`(int)、`audio.bytes`(OPUS)、`audio.path`(如 `001_001.opus`)、`audio_duration`(double，约 7–9s)、`transcription`(繁体)。
- 157 集连续无缺失，平均每集约 250 条、约 33 分钟。
- 单条约 65–84 KB，一集约 16–20 MB，全量约 2.6 GB。

约束：目标用户为中国高中生（移动端为主）；需熄屏后台连播；界面清新简洁、符合 00 后审美；技术栈安全合规、无已知漏洞、含 CC0 1.0 Universal 标识；使用阿里云国际站 Serverless 控制成本；后续转安卓/iOS APP。

技术选型（已与用户确认）：React + Vite + TypeScript（后续 Capacitor 封装）；数据分发采用「构建期抽取到 OSS + JSON 索引」的纯静态方案；插图首期占位、来源待定。

## Goals / Non-Goals

**Goals:**
- 纯静态托管：运行时零数据库、零动态函数即可提供导航、播放、脚本同步。
- 单集内多条约 8 秒 OPUS 的近无缝连续播放，移动端熄屏/锁屏持续播放并集成系统媒体控制。
- 脚本按记录顺序滚动、随播放高亮、点击定位。
- 成本可控：CDN 缓存 + 按需加载 + 预加载策略，避免一次性拉取整集/全量。
- 平台无关的播放与数据访问层，便于后续 Capacitor 封装为 APP。
- 合规基线：来源署名、CC0 1.0 Universal 标识、依赖锁定与安全审计。

**Non-Goals:**
- 不做用户账号、进度云同步、服务端渲染、搜索/推荐（后续可另立 change）。
- 不做简繁转换、逐字拼音/粤拼标注、跟读打分（超出本期「听读同步」范围）。
- 不解决小人书插图版权来源（本期占位，另立决策）。
- 不做离线整包下载/PWA 全量缓存（可后续增量）。

## Decisions

### 决策 1：构建期抽取为静态制品，而非运行时读取 parquet
构建期用 Python + `pyarrow` 读取 5 个 parquet，逐条把 `audio.bytes` 落盘为独立 OPUS 文件，并生成：
- `manifest.json`：全局清单，157 集的集号、标题、条目数、总时长、封面引用。
- `episodes/ep_<NNN>.json`：每集有序条目数组（id、duration、transcription、audio 相对路径）。
- `audio/<NNN>/<NNN>_<MMM>.opus`：逐条音频。

理由：数据只读、规模大，静态化后由 OSS + CDN 分发，运行时零函数成本、最低延迟、最易扩容。
备选（未采纳）：函数计算实时读 parquet —— 冷启动慢、并发受限、函数成本高，且 2.6 GB 单文件读取不现实；HLS 分段 —— 预处理更复杂、存储更大，且本期条目天然分段（每条约 8s），无需再切。

### 决策 2：目录/命名结构对齐数据集 ID，便于校验与 CDN 缓存
音频路径直接沿用 `audio.path`（如 `001_001.opus`），按集分目录。索引条目顺序 = ID 序号升序，与数据集一致，方便完整性校验（记录总数须等于源行数、集号 1–157 连续）。

### 决策 3：连播采用「双 `<audio>` 元素交替 + 预加载下一条」
用两个 HTMLAudioElement 交替：播放当前条时预加载下一条 `src`，`ended` 事件触发时切换到已就绪的下一元素播放，实现近无缝衔接。理由：单元素换 `src` 会有可感知的加载间隙；Web Audio 拼接解码成本高、对 OPUS 流式不友好。
备选（未采纳）：单 `<audio>` 换源（间隙明显）；MediaSource Extensions 拼接（OPUS/浏览器兼容与实现复杂度高）。

### 决策 4：熄屏后台播放用 Media Session API
播放时设置 `navigator.mediaSession.metadata`（集号/条目标题）与 `actionhandler`（play/pause/previoustrack/nexttrack）。移动端浏览器在锁屏/熄屏下依赖 Media Session 维持音频会话并显示系统媒体控制。桌面/不支持环境优雅降级（前台播放照常）。
注意：iOS Safari 后台音频对「用户手势启动播放」和音频会话连续性敏感，需在真实设备验证；这也是后续 Capacitor 原生封装能进一步加固的点。

### 决策 5：脚本同步用虚拟化列表 + IntersectionObserver 高亮
一集约 250 行脚本，用虚拟列表（如 `@tanstack/react-virtual`）避免一次性渲染全部 DOM。播放时用当前条目 index 驱动高亮与 `scrollToIndex`；检测用户手动滚动（滚动事件与播放切换解耦）时暂停自动滚屏，直到下一条切换或用户重新点击定位。点击行 → 设置当前 index → 播放该条音频。

### 决策 6：前端架构与跨端预留
React + Vite + TypeScript。分层：
- `data/`：清单与集索引加载（fetch + 类型化）。
- `player/`：播放引擎（双 audio、预加载、Media Session、错误跳过），平台无关。
- `ui/`：导航列表、集详情、脚本面板、播放控件、许可证页脚。
- 状态用轻量方案（Zustand 或 React Context + reducer），避免重依赖。
所有音频/索引访问通过可配置的 base URL（`VITE_ASSET_BASE`），Capacitor 封装时可切换为打包内置资产或远程 URL，播放与数据层无需改动。

### 决策 7：阿里云国际站 Serverless 部署形态
- 静态资源（前端构建产物 + 音频 + 索引）放 OSS，开启静态网站托管；前置 CDN（阿里云国际站 CDN/DCDN）缓存，音频设长缓存 + 内容哈希或稳定路径。
- 无需函数计算即可运行；如后续要动态能力（统计、进度同步）再引入 FC。
- 部署用 OSS 同步（ossutil / SDK）+ CDN 刷新，纳入构建脚本。
理由：契合「Serverless 控制成本」，纯静态是最低成本形态。

### 决策 8：合规与安全基线
- 页脚/关于页展示来源署名与「CC0 1.0 Universal」标识 + 许可证全文链接。
- 前端依赖锁定（lockfile）+ `npm audit`（或 osv-scanner）纳入 CI，高危漏洞阻断发布。
- 构建期 Python 依赖固定版本（pyarrow）。
- 插图：授权未定前一律占位图，上线前核查版权。

## Risks / Trade-offs

- [iOS Safari 熄屏后台播放限制严格] → 以 Media Session + 用户手势启动播放实现，在真实 iPhone 验证；不达标则由 Capacitor 原生音频会话兜底。
- [双 audio 交替在某些浏览器仍可能有微小间隙] → 预加载 + `canplaythrough` 后再切换；必要时对相邻条做短交叉淡入淡出。
- [2.6 GB 音频带来 OSS 存储与 CDN 流量成本] → CDN 长缓存、按条按需加载、仅预加载下一条；评估热点集缓存命中率；后续可做码率/封装优化。
- [首次进入集需下载索引 + 首条音频，弱网有等待] → 索引体积小（每集约 250 条文本），首屏优先加载 manifest 与首条音频，其余渐进加载。
- [小人书插图版权未定] → 本期占位图，功能不依赖真实插图；上线前单独解决授权。
- [虚拟列表 + 自动滚屏交互边界（手动滚动 vs 自动）易出 bug] → 明确以「播放条目切换」为自动滚屏唯一触发，手动滚动期间挂起，加测试覆盖。

## Migration Plan

1. 构建数据管线脚本，本地跑通抽取与完整性校验（157 集、39,173 条）。
2. 搭建 React + Vite 应用骨架，接入 `VITE_ASSET_BASE` 与数据加载层。
3. 实现播放引擎（双 audio + Media Session）与脚本同步面板。
4. 实现导航列表、集详情、封面占位、许可证页脚。
5. 本地以静态服务器模拟 OSS 结构联调；移动端真机验证熄屏播放。
6. 依赖安全审计通过后，上传制品到 OSS + 配置 CDN，灰度验证。
7. 回滚策略：OSS 保留上一版本制品目录，CDN 切回旧路径即可回滚；前端构建产物按版本目录发布。

## Open Questions

- 每集标题文案（如「第 1 集 桃园三结义」）由谁提供、是否需与评书内容对齐？（不影响架构，可后补进 manifest）
- 小人书插图最终来源与授权方式？（本期占位，上线前定）
- 是否需要简繁/粤拼对照、进度记忆等学习增强功能？（可另立 change）
