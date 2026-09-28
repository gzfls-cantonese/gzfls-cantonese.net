# Proposal

## Why

面向粤语学习者的《三国演义》评书网页目前只显示繁体 `transcription`，初学者看到汉字却不知如何发音。数据集本身不含粤拼，需要为每个汉字标注粤拼（含声调）以支撑「听读同步」的自学体验。

## What Changes

- 构建期在 Python 管线 `tools/pipeline/extract.py` 中，为每条记录的 `transcription` 生成逐字粤拼（带声调数字，如 `sam1 gwok3`），并写入按集 JSON 索引每条 entry 的新增字段。
- 前端 `ScriptPanel` 在每句繁体文本下方新增一行逐字粤拼，与上方汉字逐字对齐；标点、数字等非汉字字符在粤拼行留空占位以保持对齐。
- 脚本区新增粤拼显示开关，默认显示；关闭时仅显示繁体文本。
- 数据类型 `ScriptEntry` 扩展粤拼字段；运行时零计算（粤拼在构建期已生成，浏览器不做转换）。

## Capabilities

### New Capabilities
- `jyutping-annotation`: 覆盖粤拼的两部分行为——构建期逐字粤拼生成与数据契约（管线为每条 entry 产出与汉字逐字对齐、带声调的粤拼，非汉字留空占位），以及运行期脚本面板的粤拼显示（繁体下方对齐的粤拼行、默认显示、可切换）。

### Modified Capabilities
<!-- 无。现有 script-sync / dataset-pipeline 能力尚未归档到 openspec/specs/，
     本变更以自包含的新能力 jyutping-annotation 描述新增行为，避免与未归档变更产生路径歧义。 -->

## Impact

- 数据管线：`tools/pipeline/extract.py`、`tools/pipeline/requirements.txt`（新增粤拼字典依赖）。
- 静态资产：`dist-assets/episodes/ep_*.json` 每条 entry 新增粤拼字段；需重跑管线重建全量资产。
- 前端：`web/src/data/types.ts`（`ScriptEntry` 扩展）、`web/src/ui/ScriptPanel.tsx`（粤拼行与开关）、`web/src/styles/global.css`（逐字对齐样式）。
- 兼容性：新增字段对旧渲染逻辑无破坏；未重跑管线前若字段缺失，粤拼行应优雅降级为空而不报错。
