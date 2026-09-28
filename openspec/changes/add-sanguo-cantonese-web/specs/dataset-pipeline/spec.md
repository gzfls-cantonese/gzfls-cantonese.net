# Spec Delta

## Purpose

在构建期把 `CanCLID/zoengjyutgaai` 下的 5 个 parquet 数据集转换为可直接托管的静态制品：按集组织的 JSON 索引与逐条独立的 OPUS 音频文件，供 Serverless（OSS + CDN）低成本分发。

## ADDED Requirements

### Requirement: 从 parquet 抽取音频与脚本制品

系统 SHALL 在构建期读取全部 5 个 parquet 文件，将每条记录的 `audio.bytes` 抽取为独立 OPUS 音频文件，并将 `id`、`episode_id`、`audio_duration`、`transcription` 与音频文件相对路径写入按集组织的索引制品。抽取 MUST 保留记录 ID `sg_<集>_<序>` 的原始顺序。

#### Scenario: 单条记录抽取

- **WHEN** 管线处理一条记录（如 `sg_001_001`）
- **THEN** 生成一个可播放的 OPUS 音频文件，并在其所属集的索引中写入该记录的 id、时长、繁体脚本与音频路径

#### Scenario: 记录顺序保持

- **WHEN** 生成某一集的索引
- **THEN** 索引内条目按序号（`sg_集_000` 起递增）升序排列，与数据集原始顺序一致

### Requirement: 产出按集 JSON 索引与全局清单

系统 SHALL 为 157 集各生成一个 JSON 索引文件，并生成一个全局清单，包含集号、集标题（可后补）、条目数、总时长与封面图引用，供前端导航加载。

#### Scenario: 生成集索引

- **WHEN** 管线完成一集的抽取
- **THEN** 输出该集的 JSON 索引，包含有序条目数组及每条的 id、时长、脚本、音频路径

#### Scenario: 生成全局清单

- **WHEN** 管线完成全部集的处理
- **THEN** 输出一个全局清单，列出全部 157 集及其条目数与总时长汇总

### Requirement: 完整性校验

系统 SHALL 在管线结束时校验产出完整性：集数 MUST 为 157 且集号连续（1–157 无缺失），记录总数 MUST 与源 parquet 行数一致，任何缺失或计数不符 MUST 使构建失败并报告明细。

#### Scenario: 校验通过

- **WHEN** 抽取后集数为 157、集号连续、记录总数等于源数据行数
- **THEN** 管线成功结束并输出统计摘要

#### Scenario: 校验失败

- **WHEN** 存在缺失集号或记录数与源数据不符
- **THEN** 管线以非零状态失败，并打印缺失集号或数量差异明细

### Requirement: 制品可托管到对象存储

系统 SHALL 使产出的音频与索引制品的路径结构可直接上传到 OSS 并经 CDN 分发，音频与索引 MUST 为静态文件、无需运行时函数即可访问。

#### Scenario: 上传后静态访问

- **WHEN** 制品被上传到 OSS 并配置 CDN
- **THEN** 前端可通过稳定的静态 URL 直接获取任一集的索引与任一条音频，无需服务端动态计算
