# Tasks

## 1. 服务端函数：签名上传与删除

- [x] 1.1 新建 `server/recordings/` serverless 函数工程（Node HTTP handler，本地可运行），读取 env 配置（OSS endpoint/bucket/凭据、单段时长上限、匿名头格式）。验证：本地启动后未知路由返回 404/405，配置缺失时启动即报错。
- [x] 1.2 实现 `POST /presign-upload`：校验 `X-Anon-Id` 与时长上限，签发仅 PUT 的短时签名，返回 recId 与 uploadUrl。验证：单测覆盖缺/坏匿名头 403、超时长 413、正常返回 recId+uploadUrl。
- [x] 1.3 实现 `POST /dispose`：服务端以请求头 `X-Anon-Id` 强制重建 key 前缀（客户端 MUST NOT 传完整 key），按 `items:[{episode, entryId, recId, ext}]` 批量删除；MUST NOT 存在 list/download 路由。验证：单测覆盖跨 anonId 无法寻址（返回 `deleted:0` 且他人对象保留）、删除后对象不可取、未知路由/错误方法被拒（404/405）。
- [x] 1.4 编写 `server/recordings/README.md`：环境变量、本地运行、CORS 与 OSS lifecycle（7 天）配置清单。验证：文档条目与代码读取的配置项 grep 对照一致。

## 2. 部署脚本与文档

- [x] 2.1 新增 `tools/deploy/deploy-recordings.sh`：**平台无关打包脚本**（本机未装任何 FaaS CLI，故不绑定具体平台、脚本自身零云调用）——复用现有 `OSS_*` 环境变量、把 `server/recordings` 打包为可部署 zip、生成环境变量清单（密钥仅占位、绝不落盘/回显）、打印各平台可复制的部署命令（FC 自定义运行时 / 容器）；支持 `--dry-run` 仅打印计划。验证：`bash -n` 通过；`--dry-run` 不创建任何文件、不发起任何云调用；真实运行产出 zip（排除 `*.test.mjs`）+ env 清单，grep 确认无密钥泄漏；产物目录 `dist-deploy/` 已加入 `.gitignore`。
- [x] 2.2 `tools/deploy/DEPLOY.md` 增补「录音函数」小节：部署命令、环境变量、CORS 与 lifecycle 清单、回滚方式（下线触发器 / 不注入 `VITE_RECORDINGS_API`）。验证：文档步骤与 2.1 脚本行为一致。（已完成：新增 §9.1「匿名试讲录音函数」，含打包命令与 flags、env 表、密钥占位纪律、RAM put/delete 范围、CORS/lifecycle、前端 `VITE_RECORDINGS_API` 接线与两条回滚路径、本地 local 后端开发命令；env 名与默认值、启动命令 `node server.mjs`、node>=18 均与 `config.mjs`/`server.mjs`/`package.json` 及 2.1 脚本输出核对一致。§9.2 为评分变更的前置采购说明，明确标注「尚未实现」。）

## 3. 前端客户端：匿名 ID、上传队列与销毁保证

- [x] 3.1 新增 `web/src/data/recordings.ts`：anonId 生成与 localStorage 持久化、presign-upload/dispose 客户端、上传队列（失败退避重试上限 3 次、可 abort）。验证：vitest 覆盖 anonId 首次生成后稳定、请求携带 `X-Anon-Id`、重试与 abort 行为。
- [x] 3.2 新增 `useTrialRecord(episode, span)` hook：状态机 idle/holding/recorded/disposed、气泡数据（span/时长/Blob 引用）、同段重录覆盖（dispose 旧 recId）、销毁注册（revoke ObjectURL + dispose + pagehide keepalive）。验证：hook 测试（mock 客户端）覆盖重录覆盖旧录音、销毁后状态清空且 dispose 被调用。
- [x] 3.3 `web/src/config.ts` 增加 `VITE_RECORDINGS_API`（未设置导出 null）与 `vite-env.d.ts` 类型。验证：typecheck 通过；单测断言未设置为 null、设置时去尾斜杠。

## 4. 微信式录音 UI 与播放互斥

- [x] 4.1 新增 `web/src/data/recorder.ts`：MediaRecorder 能力检测与 mime 回退链（opus → webm/opus → mp4）、60s 上限自动停止、长按会话封装（pointerdown 开始 / pointerup 与 pointercancel 停止）。验证：vitest（mock MediaRecorder）覆盖回退链顺序、上限触发停止、pointercancel 等同松开。
- [x] 4.2 `EpisodePage.tsx` 在吸底播放条内放置与「播放/暂停」同等大小、左右平行并列的圆形录音按钮（移除前进/后退），按钮为同色系轮廓 + 白色底纹，下方浅灰小字注释「錄音和AI評分」（繁体）；长按进入 holding 时暂停数据集播放并显示文字框「你就係楷叔，快滴講尼段古仔吧」，松开退出文字框。验证：组件测试断言注释文案存在、长按触发暂停与文字框、松开后文字框消失；`global.css` 增补并列圆形按钮/文字框样式与长按抑制（touch-action、touch-callout、contextmenu）。
- [x] 4.3 新增微信语音式气泡：播放图标 + 时长，点击回放本地 Blob 并显示播放状态；回放时暂停数据集、数据集播放时暂停回放。验证：组件测试覆盖气泡回放与双向互斥。
- [x] 4.4 销毁钩子集成：点击「播放」、点击「选集」回主页、路由切换、pagehide 均触发销毁（revoke + dispose + keepalive），气泡与文字框移除。验证：集成测试断言播放点击后 dispose 被调用且气泡移除、返回主页无残留；`npm run typecheck` 与全量 `npm test` 通过。

## 5. 集成验证

- [x] 5.1 本地联调 e2e：启动函数 + dev 站点，完成「长按录 → 松开 → 气泡回放 → 同段重录覆盖 → 点击播放 / 返回主页」，并确认销毁后云端对象不可取、无 list 接口可枚举。验证：e2e 脚本或手工记录留存，含 dispose 后对象 404 与跨 anonId 403 证据。
  - 已用 Chrome（注入 WebAudio 假麦克风驱动真实 MediaRecorder）联调 `server/recordings`(local 后端, :8799) + vite dev(:5174) 全链路验证：长按显示文字框 → 松开出气泡「▶1″」→ 对象落盘 `recordings/<anon>/1_sg_001_001_<recId>.webm`（CORS+presign+PUT 通）→ 气泡回放切换「暂停回放」→ 同段重录旧对象被删（磁盘归零）→ 点击「播放」数据集播放、气泡移除、云端对象删除（磁盘归零）；anonId 稳定持久化于 localStorage。跨 anon `deleted:0`、dispose 后对象消失由服务端单测覆盖。过程中修复一处真实缺陷：`begin/end` 身份在 holding 期变化导致长按监听被中途重挂、松开丢失（改为 ref 持有 + 仅依赖 supported 挂载一次，并补回归测试）。
- [ ] 5.2 浏览器能力抽查：Chrome / Safari / 微信内置浏览器下长按抑制、气泡回放与不支持时隐藏入口的表现。验证：可用环境截图或文字记录，注明未覆盖环境与其回退行为。
