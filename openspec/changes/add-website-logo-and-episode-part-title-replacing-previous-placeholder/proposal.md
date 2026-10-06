# Proposal

## Why

站点当前只有渐变方块加「三國」文字的临时品牌标记，没有真正的 logo，也没有 favicon。同时 `manifest.json` 里每集 `title` 仍是 `extract.py` 留下的 `null` 占位，`data/episode-titles.json` 已经产出 157 集回目式对联标题、`parts` 与 5 个篇名，却还没接入应用。这次把品牌标识补齐，并用已策划好的标题/篇名数据替换占位。

## What Changes

- 新增**内联 SVG 站点 logo**（印章/篆体风格矢量标识，随包发布，无外部素材、无版权风险），替换 `Layout.tsx` 现有的 `brand-mark` 文字方块；同步提供 **favicon**（`index.html` 引用），主题色沿用现有 `--brand` 渐变。
- **接入 `extract.py` 流水线**：构建期读取 `data/episode-titles.json`，把每集 `title`（完整对联）与所属 `arc` 写入 `manifest.json`，替换 `"title": None` 占位（`extract.py:136`）；标题文件成为唯一数据源，重跑抽取即回填。
- **清单结构扩展**：`manifest.json` 顶层增加 `arcs[]`（5 个篇名，含 `id/name/subtitle/title/fromEpisode/toEpisode`），每集项增加 `arc` 字段；`title` 由 `null` 变为字符串。前端 `types.ts` 同步。
- **前端展示**：选集卡片与详情页展示**完整对联标题（单行）**；首页按 **5 个篇分组**（篇名作分节标题），详情页标注所属篇。
- 数据契约向后兼容处理：`title` 缺失时前端回退到「第 N 集」，篇分组缺失时回退到平铺列表（不破坏现有渲染）。

## Capabilities

### New Capabilities
- `site-branding`: 站点的品牌视觉标识 —— 内联 SVG logo 在页头渲染、favicon 在浏览器标签/书签显示，二者与主题色一致且在深浅背景下清晰。
- `episode-titles`: 策划好的回目式标题与篇名数据 —— 作为唯一数据源经流水线写入清单、前端按完整对联展示单集标题、并按篇（arc）对 157 集分组导航。

### Modified Capabilities
- 无。相关的 `dataset-pipeline`（「集标题（可后补）」）与 `episode-navigation`（「每项显示集号与标题」）目前仍是未归档变更 `add-sanguo-cantonese-web` 里的 delta，尚未成为 `openspec/specs/` 下的主 spec，因此无法对其写 MODIFIED delta。本变更以新增 capability 的 ADDED 需求表达新行为，与其相容、不冲突（见 Impact）。

## Impact

- 代码：`tools/pipeline/extract.py`（读取标题文件、写 `title`/`arc`/`arcs`）、`web/src/data/types.ts`（`EpisodeSummary.title: string|null` 保留、新增 `arc`；`Manifest.arcs`）、`web/src/data/api.ts`（如需篇分组辅助）、`web/src/ui/Layout.tsx`（SVG logo）、`web/src/ui/HomePage.tsx`（对联标题 + 篇分组）、`web/src/ui/EpisodePage.tsx`（标题 + 所属篇）、`web/index.html`（favicon）、`web/src/styles/global.css`（品牌/分组样式）。
- 新增资源：`web/public/` 下的 favicon 与内联 SVG 组件；数据源 `data/episode-titles.json`（已存在）。
- 制品：`dist-assets/manifest.json` 结构变化（新增字段，`title` 由 null→string），需重跑流水线生成。
- 关联：本变更建立在已完成但未归档的 `add-sanguo-cantonese-web`（episode-navigation / dataset-pipeline）之上；建议在该变更归档后再归档本变更，以便主 spec 顺序正确。无数据库、无外部服务、无密钥。
