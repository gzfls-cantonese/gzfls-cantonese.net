# Design

## Context

见 proposal.md - Why。当前状态与约束：

- `extract.py` 逐集写 `episodes/ep_<NNN>.json`，并汇总 `manifest.json`；集项标题处硬编码 `"title": None  # placeholder`（`extract.py:136`），封面为 `covers/ep_<NNN>.jpg`（当前实际 404，由 `CoverImage` 回退占位）。
- `data/episode-titles.json` 已产出且校验通过：`version/generated/dataset/style/note` + `arcs[5]`（`id/name/subtitle/title/fromEpisode/toEpisode/summary`）+ `episodes[157]`（`episode/arc/title/parts[2]/sourceChapter/verbatim/summary`），集号 1–157 连续、篇区间无缝无重叠。
- 前端 `types.ts` 已把 `EpisodeSummary.title` 定义为 `string | null`；`HomePage` 已用 `{ep.title && ...}` 条件渲染标题；`EpisodePage` 只显示「第 N 集」，未显示标题；`Layout` 页头是 `brand-mark`（渐变方块 + 「三國」文字）。`config.ts` 通过 `ASSET_BASE`/`assetUrl()` 解析数据路径。
- 约束：插画/位图版权未确认，只能用矢量/占位，不引入未授权外部图片；不新增 CDN 相关配置；`add-sanguo-cantonese-web` 已完成但未归档，其 episode-navigation / dataset-pipeline 尚不是主 spec。

## Goals / Non-Goals

**Goals:**
- 标题/篇名以 `data/episode-titles.json` 为单一数据源，经流水线回填进 `manifest.json`，重跑稳定一致。
- 页头矢量 logo + favicon，风格与 `--brand` 主题色一致，零外部位图。
- 首页按 5 篇分组、卡片与详情页展示完整对联标题（单行），详情页标注所属篇。
- 前端对「旧清单无 title / 无 arcs」保持可渲染回退。

**Non-Goals:**
- 不改封面策略（仍占位/回退），不引入小人书插画。
- 不改音频抽取、脚本同步、部署布局本身（沿用 deploy-layout 的 site→根）。
- 不做标题的多语言/拼音标注展示（`parts`/`jyutping` 不在本次 UI 范围）。
- 不在本次归档 `add-sanguo-cantonese-web`（仅在 Migration 里给出归档顺序建议）。

## Decisions

**D1 标题进入清单的方式：流水线读取标题文件（用户选定）。**
`extract.py` 新增 `--titles`（默认 `data/episode-titles.json`），启动时加载一次，构建 `{episode: {title, arc}}` 映射与 `arcs` 列表；写集项时用真实标题替换 `None`，并加 `arc` 字段；写清单顶层时加 `arcs`。
- 备选：前端运行时单独 fetch 标题文件——否决，多一个数据请求与两份真相，用户已选流水线方案。
- 备选：一次性脚本回填现有 manifest——否决，重跑抽取即被覆盖。

**D2 完整性校验扩展到标题。**
沿用现有 integrity 风格：在 `--limit-episodes`/`--no-audio` 之外，凡被处理的集号 MUST 在标题文件里有条目，缺失则收集进 `errors` 并非零退出、打印缺失集号。标题文件本身缺失视为构建失败（标题已是核心数据，且文件已随仓库提交）。
- 备选：缺标题时静默回退 `None`——否决，会把占位问题再次隐藏。

**D3 清单 schema（向后兼容新增）。**
顶层加 `arcs: [{id,name,subtitle,title,fromEpisode,toEpisode}]`（不含 `summary`，UI 不需要，减小体积）；集项加 `arc: number`，`title` 由 `null`→`string`。TS 侧 `EpisodeSummary.title` 保持 `string | null`、新增可选 `arc?: number`，`Manifest` 新增可选 `arcs?: Arc[]`——可选性保证旧清单仍能类型安全加载。

**D4 logo 与 favicon：单一矢量标识，两处复用。**
- 页头：内联 SVG React 组件（如印章/篆体「三國」或「品」字标记），用 `currentColor` + 现有 `--brand`/`--brand-strong` 渐变，替换 `Layout` 的 `brand-mark`，保留外层 `<Link to="/">` 使点击回首页。
- favicon：`web/public/favicon.svg`（同一矢量图形），`index.html` 以 `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` 引用。SVG favicon 为矢量、现代浏览器支持、无外部位图。
- 备选：PNG/ICO favicon——否决，需二进制位图素材且与「内联 SVG」决定不一致。

**D5 UI 分组与标题展示。**
- `HomePage`：当 `manifest.arcs` 存在时，按 `arc` 把集分桶，按 `fromEpisode` 排序渲染 5 个分节，节标题用篇名（`title`，即「name・subtitle」）；无 `arcs` 时回退现有平铺 `ep-grid`。集卡片始终渲染标题：`ep.title ?? \`第 ${ep.episode} 集\``，完整对联单行，配 CSS 截断防溢出。
- `EpisodePage`：把 `summary?.title` 传入并在 `<h1>` 显示完整对联（回退「第 N 集」），副行标注所属篇名（由 `summary.arc` 在 `manifest.arcs` 中查得）。
- 备选：上下联拆两行——用户已选完整对联单行。

## Risks / Trade-offs

- [对联标题较长，窄屏卡片溢出] → 单行 + `text-overflow: ellipsis`/`line-clamp` 与容器宽度约束；详情页标题可换行显示完整。
- [线上仍是旧清单（无 arcs / title=null）] → 前端全部走可选字段与回退分支，保证不崩、可平铺浏览；重跑流水线后自动升级。
- [构建环境缺 `data/episode-titles.json`] → 该文件已提交入库，随仓库分发；缺失时按 D2 明确失败而非静默。
- [SVG favicon 在极旧浏览器不显示] → 仅影响标签图标，页头 logo 与内容不受影响；如需可后续补 PNG，不在本次范围。
- [与未归档的 add-sanguo-cantonese-web 能力重叠] → 本变更用新 capability 的 ADDED 需求表达，不写 MODIFIED；归档顺序见 Migration。

## Migration Plan

1. 实现后重跑 `extract.py`（全量）重新生成 `dist-assets/manifest.json`，确认集项 `title` 非空、含 `arc`，顶层含 `arcs`，integrity 校验通过。
2. `web` 构建（`ASSET_BASE` 沿用部署注入的 `/sanguo/data`），本地验证首页分组、卡片/详情页标题、页头 logo、标签 favicon。
3. 部署沿用 deploy-layout：站点上传到桶根，数据在稳定 `sanguo/data/`。本次仅 `manifest.json` 内容变化，音频/集索引不变。
4. 回滚：重新部署上一版站点构建即可；数据侧 manifest 可由上一版代码重跑生成，无需改动音频。
5. 归档顺序建议：先归档 `add-sanguo-cantonese-web`（使 episode-navigation / dataset-pipeline 成为主 spec），再归档本变更，保持主 spec 演进顺序清晰。

## Open Questions

- 篇分节标题用 `title`（「群雄逐鹿・漢室傾頹」）还是仅 `name`（「群雄逐鹿」）作视觉主标题、`subtitle` 作副标——纯展示细节，可在实现时定，不影响 spec/结构。
