# 回滚方案（A 方案：site 在 bucket 根）

A 方案下前端直接上传到 **bucket 根**、每次部署覆盖，**不保留版本目录**；数据制品在稳定前缀 `<PREFIX>/data/`（默认 `sanguo/data/`），跨部署共用、回滚时不动。

```
oss://<BUCKET>/index.html + assets/   # 前端（根，每次部署覆盖）
oss://<BUCKET>/<PREFIX>/data/          # 数据（稳定，回滚不涉及）
oss://<BUCKET>/<PREFIX>/CURRENT        # 最近一次部署的版本时间戳
```

因为没有旧版本目录可直接切回，**回滚 = 用上一个已知良好的代码重新构建并重新部署到根**。数据无需重传。

## 回滚步骤

1. 确定要回到的代码版本（上一个已知良好的 commit / tag）：

   ```bash
   git log --oneline -n 10        # 找到良好版本的 commit
   ```

2. 切到该版本（如有未提交改动先 `git stash -u` 或提交，避免丢失）：

   ```bash
   git checkout <good-commit>
   ```

3. 重新部署（脚本会重新 build 并把 site 覆盖到 bucket 根；数据段若启用则增量、不变则跳过）：

   ```bash
   export OSS_BUCKET=<你的bucket> OSS_ENDPOINT=oss-cn-hongkong.aliyuncs.com
   export OSS_ACCESS_KEY_ID=... OSS_ACCESS_KEY_SECRET=...
   bash tools/deploy/deploy.sh
   ```

4. 验证：访问站点根 `/` 与深链接 `/episode/1`，确认回到良好版本；数据 `/sanguo/data/manifest.json` 与任一音频照常可用。

5. 回到工作分支：

   ```bash
   git checkout -    # 或 git checkout main
   ```

## 说明与演练要求

- 数据在稳定前缀，回滚**不涉及任何数据制品传输**，只重建/重传小体积前端。
- 若希望"秒级切回、无需重建"，需要保留版本化 site 目录（A 方案不含）；如有此需求请提出，另设方案。
- 正式发布前至少完成一次回滚演练：部署当前版本 → `git checkout` 上一良好版本 → 重新部署 → 验证根路径与深链接正常、数据照常播放。演练通过后方可上线。
