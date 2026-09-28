# Proposal

## Why

面向中国高中生，用《三国演义》经典粤语评书作为沉浸式语料来学习粤语，缺乏一个既能连续听评书、又能同步看繁体脚本、还能在手机熄屏下持续播放的轻量网页。仓库已有从 Hugging Face 下载的 5 个 parquet 文件（`CanCLID/zoengjyutgaai`，共 39,173 条约 8 秒的 OPUS 音频记录，覆盖完整 157 集，繁体转写脚本齐全），需要把它们转化为一个可上线、合规、低成本的 Serverless 学习网页，并为后续封装成安卓/iOS APP 预留架构。

## What Changes

- 新增构建期数据管线：把 5 个 parquet 抽取为「按集组织的 JSON 索引 + 独立 OPUS 音频文件」，托管到阿里云 OSS + CDN，Serverless 仅做静态托管。
- 新增 157 集评书导航：分集列表、集详情页，展示每集标题、条数、总时长与《三国演义》小人书封面图（首期用占位图，来源待定）。
- 新增单集连续播放：一集内约 250 条 8 秒 OPUS 记录顺序无缝连播，提供播放/暂停/上一条/下一条/进度控制。
- 新增手机熄屏后台播放：通过 Media Session API + `<audio>` 元素，在锁屏/熄屏状态下继续播放并显示媒体控制。
- 新增脚本滚屏同步：按该集数据集记录顺序（ID `sg_集_序` 递增）滚动显示繁体脚本，随播放高亮当前句，支持点击句子跳转播放。
- 新增清新简洁、符合 00 后审美的响应式 UI（移动端优先）。
- 新增合规标识：页脚/关于页展示数据集来源与 CC0 1.0 Universal 公共许可证标识；锁定依赖版本并通过安全审计，避免已知漏洞。
- 预留跨端能力：Web 采用 React + Vite，后续用 Capacitor 封装为安卓/iOS APP，播放与数据访问层保持平台无关。

## Capabilities

### New Capabilities
- `dataset-pipeline`: 构建期从 parquet 抽取 OPUS 音频与繁体脚本，生成按集 JSON 索引与静态资源，产出可托管到 OSS/CDN 的制品，并校验记录数与集数完整性。
- `episode-navigation`: 157 集评书的浏览与导航，包括分集列表、集详情、封面图与元信息展示。
- `audio-playback`: 单集内多条 8 秒记录的连续播放、播放/暂停/切条/进度控制，以及移动端熄屏后台持续播放与媒体控制集成。
- `script-sync`: 按数据集记录顺序滚动显示繁体脚本、随播放高亮当前句、点击句子定位播放。
- `content-licensing`: 数据集来源署名与 CC0 1.0 Universal 许可证标识展示，以及依赖安全与合规基线。

### Modified Capabilities
<!-- 无既有能力被修改；openspec/specs 目前为空。 -->

## Impact

- 新增前端应用（React + Vite + TypeScript），后续接入 Capacitor。
- 新增构建期数据管线脚本（Python，读取 `CanCLID/zoengjyutgaai/*.parquet`）。
- 新增阿里云国际站 Serverless 部署（OSS 静态托管 + CDN；如需动态能力用函数计算），音频/索引制品上传至 OSS。
- 依赖：`pyarrow`（数据抽取，构建期）、前端播放与状态管理相关库、Capacitor（后续）。
- 数据规模：约 2.6 GB 音频、39,173 条记录、157 集；需规划 OSS 存储、CDN 缓存与预加载策略以控制成本。
- 合规：CC0 1.0 Universal 许可证署名；小人书插图首期占位、来源与授权待定，正式上线前需解决图片版权。
