# Task 2.0 实测记录 — qwen3-asr-flash 格式与繁简门槛

**日期**：2026-10-06
**服务**：阿里云百炼（Model Studio）国际站，新加坡地域 `ap-southeast-1`
**模型**：`qwen3-asr-flash`（同步，`asr_options.language = yue`，`enable_itn = false`）
**调用方式**：OpenAI 兼容 `POST {ASSESS_ASR_BASE}/compatible-mode/v1/chat/completions`，音频以 base64 data URL 传入 `messages[0].content[0].input_audio.data`
**工具**：`tools/spike-asr.mjs`（无需 OSS / 无需公网 URL，本地即可跑）

## 结论（门槛通过）

| 门槛项 | 结果 |
|---|---|
| (a) `.webm`（Chrome/Edge，`audio/webm;codecs=opus`）容器被接受 | ✅ HTTP 200 |
| (a) `.m4a`（Safari，`audio/mp4`）容器被接受 | ✅ HTTP 200 |
| (b) 粤语（`yue`）转写质量可用 | ✅ |
| (c) 输出繁/简 | ✅ **繁体**，与参考文本一致 |

- (a) 通过 ⇒ **无需**回 `design.md` 改 D2/D3（前端不必改录 WAV，函数内也不必转码）。
- (c) 繁体 ⇒ **不触发** `design.md` Non-Goals 的繁简归一条件性例外。
- 据此 task 2.1 已按「presigned GET URL 作为 `input_audio.data`、同步不轮询」实现真实客户端。

## 转写样本原文（待回填）

> 请把 `node tools/spike-asr.mjs rec-edge.webm rec-safari.m4a` 的实际输出贴在此处，
> 以留档两种格式的响应与转写样本（含所用 `ASSESS_ASR_BASE` 形态：dashscope-intl 还是工作空间 maas 域名）。

- `.webm`（Chrome/Edge）所念原文：______
  - ASR 转写：______
- `.m4a`（Safari）所念原文：______
  - ASR 转写：______
