# Tasks

## 1. 标题数据接入流水线（extract.py）

- [x] 1.1 在 `tools/pipeline/extract.py` 增加 `--titles`（默认 `data/episode-titles.json`）参数，启动时加载并构建 `{episode: {title, arc}}` 映射与 `arcs` 列表；文件缺失时以非零状态失败并打印路径。验证：`python tools/pipeline/extract.py --help` 显示 `--titles`；指向不存在路径时报错退出。
- [x] 1.2 写集项时用真实标题替换 `"title": None`（`extract.py:136`），并加入 `arc` 字段；写清单顶层时加入 `arcs: [{id,name,subtitle,title,fromEpisode,toEpisode}]`。验证：`--limit-episodes 3 --no-audio` 试跑后 `dist-assets/manifest.json` 前 3 集 `title` 为非空对联字符串、含 `arc`，顶层含 5 个 `arcs`。
- [x] 1.3 扩展完整性校验：凡被处理的集号 MUST 在标题文件里有条目，缺失则收集进 `errors`、非零退出并打印缺失集号（含 `--limit-episodes` 情形只校验已处理集）。验证：临时构造缺一条的标题文件试跑，构建失败并列出缺失集号；恢复后通过。
- [x] 1.4 全量重跑 `python tools/pipeline/extract.py`（不加 limit），确认 integrity 通过（157 集连续、记录数一致）且清单每集 `title` 非空、含 `arc`、顶层含 `arcs`。验证：脚本输出 integrity passed；`python -c` 断言 157 集 title 全非空。

## 2. 前端数据类型

- [x] 2.1 在 `web/src/data/types.ts` 为 `EpisodeSummary` 增加可选 `arc?: number`（`title` 保持 `string | null`），新增 `Arc` 接口与 `Manifest.arcs?: Arc[]`。验证：`npm run build`/`tsc` 无类型错误；旧清单（无 arcs/arc）仍通过类型检查。

## 3. 站点 logo 与 favicon（site-branding）

- [x] 3.1 新增内联 SVG logo 组件（印章/篆体风格，`currentColor` + `--brand`/`--brand-strong` 渐变），在 `web/src/ui/Layout.tsx` 用它替换 `brand-mark` 文字方块，保留外层 `<Link to="/">`。验证：本地起站点，页头显示矢量 logo，点击回首页；DevTools Network 无 logo 位图请求。
- [x] 3.2 新增 `web/public/favicon.svg`（与页头同一图形），在 `web/index.html` 加 `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`。验证：浏览器标签页显示 favicon；请求 `/favicon.svg` 返回 200。
- [x] 3.3 在 `web/src/styles/global.css` 调整 `.brand`/`.brand-mark` 相关样式以适配 SVG logo（尺寸、对齐、深浅背景清晰度）。验证：页头在浅色背景下 logo 清晰、与导航对齐无错位。

## 4. 单集标题与篇分组展示（episode-titles）

- [x] 4.1 `web/src/ui/HomePage.tsx`：集卡片始终渲染完整对联标题单行 `ep.title ?? \`第 ${ep.episode} 集\``，替换现有 `{ep.title && ...}` 条件渲染。验证：卡片显示完整对联；对无标题的模拟数据回退「第 N 集」。
- [x] 4.2 `web/src/ui/HomePage.tsx`：当 `manifest.arcs` 存在时按 `arc` 分组、按 `fromEpisode` 排序渲染 5 个分节（节标题用篇名），组内按集号列出；无 `arcs` 时回退现有平铺 `ep-grid`。验证：首页显示 5 个篇分节且集数合计 157；删除 arcs 模拟旧清单时回退平铺且不报错。
- [x] 4.3 `web/src/ui/EpisodePage.tsx`：`<h1>` 显示完整对联标题（回退「第 N 集」），副行标注所属篇名（由 `summary.arc` 在 `manifest.arcs` 中查得）；确认传入 `usePlayer` 的 `episodeTitle` 用真实标题。验证：进入某集详情页显示对联标题与所属篇；播放条/标题不再是「第 N 集」占位。
- [x] 4.4 在 `web/src/styles/global.css` 为对联标题与篇分节加样式：单行标题 `text-overflow: ellipsis`/宽度约束防溢出，详情页标题可换行显示完整，篇分节标题与卡片间距协调。验证：窄屏（移动端宽度）下卡片标题不撑破布局，详情页标题完整可读。
- [x] 4.5 更新/新增前端单测覆盖标题回退与篇分组：`HomePage` 在有/无 `arcs` 下的渲染分支、卡片标题回退「第 N 集」。验证：`npm test` 通过，新增用例覆盖两条回退路径。

## 5. 集成验证

- [x] 5.1 用第 1 步全量生成的 `dist-assets/manifest.json` 在本地跑前端，端到端确认：页头 logo、标签 favicon、首页 5 篇分组、卡片对联标题、详情页标题与所属篇全部正确，且对旧清单回退分支不崩。验证：本地 `npm run dev` 手动走查 + `npm run build` 成功；浏览器无控制台报错、无未授权外部图片请求。

## 6. 线上数据刷新修复（标题/篇名未生效）

- [x] 6.1 `web/src/config.ts` 增加 `DEPLOY_VERSION` 与 `indexUrl()`，索引 JSON 请求带 `?v=` 版本标识。验证：typecheck 通过、api 测试通过。
- [x] 6.2 `web/src/data/api.ts` 的 manifest 与单集索引改走 `indexUrl()`；音频/封面 URL 保持不变。验证：13/13 测试通过。
- [x] 6.3 `tools/deploy/deploy.sh` 构建时注入 `VITE_DEPLOY_VERSION`；新增 `tools/deploy/deploy-data-index.sh` 仅上传 manifest/episodes 索引并以 `max-age=300` 覆盖缓存头。验证：脚本语法检查通过。
- [x] 6.4 `tools/deploy/DEPLOY.md` 补充「只刷新数据索引」流程与 immutable 缓存污染说明。验证：文档与脚本行为一致。
