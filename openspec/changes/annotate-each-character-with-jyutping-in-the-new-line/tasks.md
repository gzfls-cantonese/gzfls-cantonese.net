# Tasks

## 1. 构建期粤拼生成（管线）

- [x] 1.1 在 `tools/pipeline/requirements.txt` 增加粤语 G2P 库依赖（先用小样对比 `jyutping` 与 `PyJyutping` 对繁体与多音字的覆盖，选定其一），运行 `pip install -r requirements.txt` 验证依赖可安装、可 `import`。
- [x] 1.2 在 `tools/pipeline/extract.py` 增加逐字粤拼生成：对每条 `transcription` 按码点逐字转换，产出与字符序列等长的 `jyutping` 数组（带声调数字，非汉字/无读音字为 `""`），写入每条 entry；用 `python extract.py --limit-episodes 1 --skip-audio` 生成小样并人工核对「字—粤拼」逐字对齐、标点留空占位正确。
- [x] 1.3 为粤拼生成逻辑加单元测试（如 `tools/pipeline/test_jyutping.py`）：覆盖纯汉字、含标点/数字/空格、生僻字无读音三类输入，断言输出数组长度等于输入码点数且非汉字位为 `""`；运行 `pytest tools/pipeline` 验证通过。
- [x] 1.4 跑全量管线重建 `dist-assets`（`python extract.py`），确认既有完整性校验（157 集、记录数匹配）仍通过，并抽查若干 `episodes/ep_*.json` 每条 entry 均含 `jyutping` 字段。

## 2. 前端数据契约与渲染

- [x] 2.1 在 `web/src/data/types.ts` 为 `ScriptEntry` 增加可选 `jyutping?: string[]` 字段；运行 `npm run build`（或 `tsc`）验证类型通过。
- [x] 2.2 在 `web/src/ui/ScriptPanel.tsx` 将每行改为逐字竖排单元格渲染：用 `Array.from(transcription)` 取码点，与 `entry.jyutping` zip，每单元格上为汉字、下为对应粤拼；`jyutping` 缺失或长度不匹配时降级为仅显示繁体文本、不报错。
- [x] 2.3 上调虚拟化 `estimateSize` 以匹配含粤拼带的行高，保留 `measureElement` 实测；在开发服务器手动确认长句换行后每个视觉行汉字与粤拼仍逐字对齐。
- [x] 2.4 为 `ScriptPanel` 增加组件测试：覆盖「有 `jyutping` 字段渲染出对齐粤拼」「缺字段时仅显示繁体且不抛错」两种情况；运行前端测试（如 `npm test`）验证通过。

## 3. 粤拼显示开关与样式

- [x] 3.1 在脚本区（`ScriptPanel` 或 `EpisodePage`）新增粤拼显示开关，默认显示；关闭时不渲染单元格下半部粤拼，且切换不触碰 `usePlayer`/`currentIndex`；手动验证切换隐藏后播放与当前句高亮不变。
- [x] 3.2 在 `web/src/styles/global.css` 增加竖排单元格样式（汉字带 + 粤拼带、非汉字占位保持等高、行内换行对齐、当前句高亮下粤拼配色协调）；在浏览器确认显示效果与对齐。
- [x] 3.3 为开关行为补充测试：默认显示、切换隐藏后仅繁体、隐藏状态下点击行仍能定位播放；运行前端测试验证通过。

## 4. 集成校验

- [x] 4.1 端到端手动验证：进入某集详情页，繁体下方默认显示逐字对齐粤拼（带声调），播放时当前句高亮与自动滚屏正常、点击脚本行可定位，开关可切换；用真实重建后的 `dist-assets` 走一遍完整流程。
- [x] 4.2 运行全部测试与构建（管线 `pytest`、前端 `npm test` 与 `npm run build`）确认全绿；确认未重跑管线的旧 JSON（无 `jyutping` 字段）下前端仍优雅降级。
