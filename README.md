<div align="center">
  <img src="data/README-banner.png" alt="品三國 · 識粵語" style="max-width: 70%; height: auto;" />

  # 品三國 · 識粵語

  [广州外国语学校](https://www.gzfls.edu.cn/) 粤语社出品
  
  [粵語計算語言學基礎建設組（CanCLID）](https://huggingface.co/CanCLID)提供语料
</div>

<div align="center">

[![CI](https://github.com/gzfls-cantonese/gzfls-cantonese.net/actions/workflows/ci.yml/badge.svg)](https://github.com/gzfls-cantonese/gzfls-cantonese.net/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![tested with vitest](https://img.shields.io/badge/tested%20with-vitest-6e9f18.svg?style=flat-square&logo=vitest)](https://vitest.dev/)
[![npm](https://img.shields.io/badge/npm-%3E%3D10-CB3837.svg?style=flat-square&logo=npm)](https://www.npmjs.com/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-3C873A.svg?style=flat-square&logo=nodedotjs)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg?style=flat-square&logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB.svg?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)

[简体中文](README.md) | [English](README_en.md)

</div>

---

## 1. 项目简介

[品三國 · 識粵語](https://gzfls-cantonese.net/) 是广州外国语学校粤语社开发维护的粤语学习网站，用张悦楷先生脍炙人口的《三国演义》经典粤语评书，推广古雅而生动的粤语文本和标准粤语发音。网站把粵語計算語言學基礎建設組（CanCLID）发布的[公共数据集](https://huggingface.co/datasets/CanCLID/zoengjyutgaai)，合共 39,173 段音频和繁体脚本，转化为一个可持续欣赏，并用AI技术练习标准粤语发音的学习网站。

网站实现了“听评书 → 看脚本 → 跟读试讲 → 回听对比 → AI 评分纠正”的完整学习闭环：访客既能连续收听评书、同步高亮繁体脚本、逐字对照粤拼，也能像发微信语音一样长按试讲、回听自己的发音，并按需触发一次 AI 粤语发音评分。

- **纯静态主体**：前端与数据制品都是静态文件，托管在阿里云 OSS，无自建常驻后端。
- **可选动态特性**：匿名试讲录音与 AI 评分由一个零依赖的函数计算（FC）后端提供，可整体开关、独立回滚。
- **规格驱动开发 SDD**：网站开发迭代使用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) SDD软件、阿里云Qoder系列AI开发工具，人机协作完成。

## 2. 功能特性

### 2.1 评书浏览与播放

- **157 集导航**：分集列表与集详情页，展示回目式对联标题、条数与总时长；首页按 5 个「篇」分组，封面图首期用占位图。
- **单集连续播放**：一集内约 250 条 8 秒 OPUS 记录顺序无缝连播，提供播放 / 暂停 / 进度控制。
- **熄屏后台播放**：通过 Media Session API + `<audio>` 元素，在手机锁屏 / 熄屏状态下持续播放并显示系统媒体控制。
- **脚本滚屏同步**：按数据集记录顺序滚动显示繁体脚本，随播放高亮当前句，点击句子即可跳转播放。
- **逐字粤拼标注**：每句繁体文本下方对齐显示带声调的逐字粤拼（构建期生成、运行时零计算），并提供显示开关。

### 2.2 跟读试讲与 AI 评分

- **微信式长按录音**：长按录制当前脚本单段、松开即停，自动暂停评书播放并提示试讲；无需登录、不收集个人信息。
- **本地缓存 + 后台上传**：录音先在浏览器会话内缓存，后台上传到按匿名 ID 隔离的私有存储，失败自动重试；多个匿名会话可并发上传而互不干扰、互不可寻址。
- **语音气泡回放**：录音以微信语音式气泡（播放图标 + 时长）呈现，点击回放本地缓存，同段重录覆盖旧录音。
- **退出即销毁**：切换路由、返回主页或关闭 / 刷新页面时，本地与云端录音一并删除（带重试与卸载安全请求），服务端另有 7 天生命周期兜底自清。
- **按需 AI 发音评分**：气泡上传完成后出现「评分」按钮，点击后由服务端调用粤语 ASR 转写、与参考文本做**同音容错**相似度打分（0–100），并回显分数与转写；检测到非粤语朗读会给出提示。评分不自动触发，配合服务端限流控制成本。

### 2.3 界面与品牌

- **双语 UI**：内置 `zh-Hant` 与 `en` 两套消息字典，仅翻译 UI 外壳（语料、回目、脚本保持原文），默认繁体、可即时切换并持久化。
- **品牌标识**：随包发布的内联 SVG logo 与 favicon（印章 / 篆体风格矢量标识，无外部素材、无版权风险）。
- **合规署名**：页脚与「关于」页展示数据集来源与 CC0 1.0 Universal 许可标识；录音与评分的隐私处理另设专门说明页。

## 3. 技术框架和部署架构

### 3.1 技术框架

| 层 | 技术选型 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite + TypeScript | `react-router-dom` v7 路由、`zustand` 状态、`@tanstack/react-virtual` 长列表虚拟化 |
| 前端测试 | Vitest + Testing Library + jsdom | 组件与逻辑单测，`npm test` 运行 |
| 数据管线 | Python（`pyarrow` + `pyjyutping`） | 构建期把 parquet 抽取为按集 JSON 索引 + 独立 OPUS 音频 + 逐字粤拼 |
| 动态后端 | 零依赖 Node ≥ 18 HTTP 函数 | 提供签名上传 / 删除 / 评分三类操作，`node --test` 覆盖 80 项 |
| 跨端预留 | Capacitor（后续） | 播放与数据访问层保持平台无关，便于封装 APP |

### 3.2 部署架构

采用「静态为主、动态可选」的 Serverless 架构：

```
浏览器
  │
  ├── 站点 + 数据（静态） ──► 阿里云 OSS 静态网站托管（可选 CDN 加速）
  │                            ├── bucket 根：index.html / assets/（前端构建产物）
  │                            └── <PREFIX>/data/：音频 + 索引 + 粤拼（稳定前缀，跨部署共用）
  │
  └── 录音 / 评分（动态，可选） ──► 阿里云函数计算 FC（零依赖 Node HTTP 触发器）
                                     ├── 直传 / 删除录音 ──► OSS 私有前缀 recordings/（CORS + 7 天 lifecycle）
                                     └── 评分时调用 ──► 阿里云百炼 DashScope 粤语 ASR（新加坡 ap-southeast-1）
```

- 前端部署到 **bucket 根**，由 OSS 静态网站托管以 `index.html` 对外服务；错误页回退到 `index.html`（响应码设为 `200`）以支撑 SPA 深链路由。
- 数据制品放在**稳定前缀** `<PREFIX>/data/`（默认 `sanguo/data/`），一次增量上传、跨部署共用，前端通过构建期注入的 `VITE_ASSET_BASE` 访问，与站点路径解耦。
- 录音函数独立部署，不进 OSS；前端通过 `VITE_RECORDINGS_API` 连接，不注入则整套录音 UI 不渲染——这既是特性开关，也是回滚开关。

## 4. 项目文件目录结构

```
gzfls-cantonese.net/
├── web/                        # React + Vite + TypeScript 前端
│   ├── src/
│   │   ├── ui/                 # 页面与组件（首页/选集/播放条/脚本面板/试讲录音/关于/隐私）
│   │   ├── data/               # 数据访问、录音采集与上传、类型定义
│   │   ├── player/             # 播放状态与 Media Session 集成
│   │   ├── i18n/               # 双语字典、Locale Provider、语言切换器
│   │   ├── styles/             # 全局样式
│   │   └── assets/logo.svg     # 内联 SVG 站点 logo
│   └── public/                 # favicon 等静态资源
├── server/recordings/          # 零依赖 Node 函数：签名上传 / 删除 / 评分
├── tools/
│   ├── pipeline/               # parquet → 静态制品抽取、粤拼字典生成、取数与校验脚本
│   └── deploy/                 # OSS 部署脚本、录音函数打包、回滚文档（DEPLOY.md / ROLLBACK.md）
├── data/episode-titles.json    # 157 集回目式标题与篇名（唯一数据源）
├── dist-assets/                # 构建产物：音频 + 索引 + 粤拼（gitignore，上传至 OSS）
├── CanCLID/zoengjyutgaai/      # 原始 parquet 数据集（约 2.5 GB，gitignore，用取数脚本获取）
├── openspec/                   # OpenSpec 规格与变更（changes / specs / archive）
├── .qoder/                     # Qoder 命令与技能（opsx 工作流）
├── .github/workflows/ci.yml    # GitHub Actions CI（web + server 两个 job）
├── LICENSE                     # MIT
└── README.md
```

## 5. 用到的阿里云服务（含 Qoder 与 OpenSpec 工具）

### 5.1 阿里云服务

| 服务 | 用途 | 关键说明 |
|---|---|---|
| **对象存储 OSS** | 静态网站托管（前端 + 数据制品）与录音私有存储 | 选用国际站**香港地域**（免 ICP 备案）；静态站建议公共读，录音前缀 `recordings/` 私有 |
| **CDN**（可选） | 加速音频与静态资源分发 | 设置 `CDN_DOMAIN` 后由部署脚本触发刷新 |
| **函数计算 FC** | 承载录音 / 评分后端（零依赖 Node HTTP 触发器） | HTTP 触发器认证方式须选**无需认证**，放行 `POST/GET/OPTIONS` |
| **百炼 Model Studio（DashScope）** | 粤语语音识别，用于发音评分 | 默认模型 `qwen3-asr-flash`（同步调用）；服务地域为**新加坡 `ap-southeast-1`**，API Key 为地域级、计费独立于中国站 |
| **RAM 访问控制** | 为录音函数签发最小权限子账号 | 仅授予 `recordings/` 前缀的对象级 `PutObject/GetObject/DeleteObject`，**不含 `ListObjects`** |

### 5.2 研发工具

- **Qoder**：承载本项目的 AI 辅助研发流程，`.qoder/` 下内置 `opsx` 命令与技能（propose / apply / archive / sync / update / explore），与 OpenSpec 工作流打通。
- **OpenSpec**：规格驱动开发。所有需求以变更（change）形式沉淀在 `openspec/changes/`，每个变更含 `proposal.md`（动机与范围）、`design.md`（设计与取舍）、`specs/`（能力契约）与 `tasks.md`（实现任务）；已定稿的能力归档到 `openspec/specs/`，历史变更进入 `openspec/changes/archive/`。本 README 的功能与架构即由这些 propose 文档整合而来。

## 6. 部署发布流程

> 完整步骤见 [`tools/deploy/DEPLOY.md`](tools/deploy/DEPLOY.md)，回滚见 [`tools/deploy/ROLLBACK.md`](tools/deploy/ROLLBACK.md)。

### 6.1 生成数据制品

```bash
# 1. 取源数据（5 个 parquet 约 2.5 GB，按 sha256 校验，可断点续传）；大陆走镜像
HF_ENDPOINT=https://hf-mirror.com tools/pipeline/fetch-dataset.sh

# 2. 抽取为静态制品（含完整性校验：157 集连续、记录数与源一致）
pip install -r tools/pipeline/requirements.txt
python3 tools/pipeline/extract.py --src CanCLID/zoengjyutgaai --out dist-assets
```

### 6.2 部署站点与数据到 OSS

```bash
export OSS_BUCKET=<你的bucket>
export OSS_ENDPOINT=oss-cn-hongkong.aliyuncs.com
export OSS_ACCESS_KEY_ID=...
export OSS_ACCESS_KEY_SECRET=...

bash tools/deploy/deploy.sh
```

脚本自动完成：注入 `VITE_ASSET_BASE` 与部署版本号 → 构建前端 → 上传 `web/dist/` 到 bucket 根 → 增量上传 `dist-assets/` 到稳定前缀 → 写部署版本标记。仅刷新索引（如更新集标题 / 篇名）可用 `tools/deploy/deploy-data-index.sh`，随后需重跑 `deploy.sh` 发布带新版本号的站点以绕过旧的 immutable 缓存。

首次部署后需在 OSS 控制台开启**静态网站托管**（首页与 404 页均指向 `index.html`，错误响应码设为 `200`），并按需配置 CORS、生命周期与 RAM。

### 6.3 部署录音 / 评分函数（可选）

```bash
# 打包（脚本本身不推送、不调用任何云 API），生成 zip 与 env 清单
bash tools/deploy/deploy-recordings.sh --dry-run   # 先看计划
bash tools/deploy/deploy-recordings.sh             # 实际打包到 dist-deploy/
```

将 zip 部署到函数计算，按 `.env` 清单设置环境变量（评分另需 `DASHSCOPE_API_KEY` 与 `ASSESS_*`），挂 HTTP 触发器（认证方式选**无需认证**）并记下公网 URL；前端构建时注入 `VITE_RECORDINGS_API=<触发器 URL>` 即启用录音与评分。

### 6.4 持续集成

GitHub Actions（`.github/workflows/ci.yml`）在 push 到 `main` 与 PR 时运行两个 job：`web`（依赖安全审计 → 类型检查 → 单测 → 构建）与 `server`（`node --test`）。

## 7. 数据来源声明

- **语料来源**：Hugging Face · 粵語計算語言學基礎建設組（CanCLID）[`zoengjyutgaai`](https://huggingface.co/datasets/CanCLID/zoengjyutgaai)《三国演义》粤语评书数据集（157 集、39,173 段 OPUS 音频 + 繁体脚本，5 个 parquet 约 2.5 GB）。
- **授权**：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)（公共领域贡献）。站点页脚与「关于」页均展示来源与许可标识。
- **原始数据不入库**：parquet 与 `dist-assets/` 构建产物均已 gitignore，通过 `tools/pipeline/fetch-dataset.sh` 按 `tools/pipeline/dataset.sha256` 校验获取。
- **插图版权待确认**：各集《三国演义》小人书插图的来源与授权尚未确认，正式上线真实插图前一律使用占位图，**不展示任何未授权图片**。
- **录音隐私**：访客试讲录音为本人声音，按匿名 ID 隔离存放、退出即销毁并有 7 天生命周期兜底；评分会把录音短时效交给第三方 AI 服务处理，分数与转写不持久化。详见站内「錄音和AI評分隱私處理聲明」页。

## 许可

本项目基于 [MIT License](LICENSE) 开源。
