# gzfls-cantonese.app

The gzfls-cantonese.net website — 面向中国高中生、基于《三国演义》经典粤语评书学习粤语的网页（后续封装为安卓/iOS APP）。

## 数据与授权

- 语料来源：Hugging Face · CanCLID [`zoengjyutgaai`](https://huggingface.co/datasets/CanCLID/zoengjyutgaai)《三国演义》粤语评书数据集（157 集、约 3.9 万段 OPUS 音频 + 繁体脚本）。
- 授权：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)（公共领域贡献）。站点页脚与「关于」页均展示来源与许可标识。

## 目录

- `CanCLID/zoengjyutgaai/` — 原始 parquet 数据集（不入库分发，仅本地构建用）。
- `tools/pipeline/` — 构建期抽取脚本（parquet → 静态音频/索引制品）。
- `dist-assets/` — 生成的静态制品（gitignore，上传至 OSS/CDN）。
- `web/` — React + Vite + TypeScript 前端。

## 构建数据制品

```bash
pip install -r tools/pipeline/requirements.txt
python3 tools/pipeline/extract.py --src CanCLID/zoengjyutgaai --out dist-assets
```

脚本会做完整性校验（157 集连续、记录数与源一致），不符则非零退出。

## 前端开发

```bash
cd web
npm ci
npm run dev      # http://localhost:5173，/data 指向 ../dist-assets
npm test
npm run build
```

## 待办 / 合规提醒

- [ ] 各集《三国演义》小人书插图的来源与授权尚未确认；在此之前一律使用占位图，**不展示任何未授权图片**。正式上线真实插图前必须先解决版权。
- [ ] 每集标题文案待补（当前 manifest 中 `title` 为占位 `null`）。
