# 回滚方案（OSS 版本目录 + CDN 切回）

部署脚本把每次发布写入独立版本目录：

```
oss://<BUCKET>/<PREFIX>/v<timestamp>/site/   # 前端构建产物
oss://<BUCKET>/<PREFIX>/v<timestamp>/data/   # 音频 + 索引制品
oss://<BUCKET>/<PREFIX>/CURRENT               # 文本文件，内容为当前版本号
```

CDN/静态托管的源指向 `<PREFIX>/<当前版本>/`。因为旧版本目录始终保留，回滚不需要重新构建或重新上传。

## 回滚步骤

1. 查看历史版本：

   ```bash
   ossutil ls oss://<BUCKET>/<PREFIX>/ -d --endpoint <ENDPOINT>
   cat CURRENT   # 当前版本
   ```

2. 选择一个上一个已知良好的版本 `vPrev`，把 `CURRENT` 指回它：

   ```bash
   echo "vPrev" > CURRENT
   ossutil cp CURRENT oss://<BUCKET>/<PREFIX>/CURRENT --endpoint <ENDPOINT>
   ```

3. 将静态托管/CDN 的源路径切回 `<PREFIX>/vPrev/`（或在 CDN 上把回源路径改到该版本目录）。

4. 刷新 CDN 缓存使切换立即生效：

   ```bash
   aliyun cdn RefreshObjectCaches --ObjectPath "https://<CDN_DOMAIN>/" --ObjectType Directory
   ```

5. 验证：访问首页与任一集索引、任一条音频，确认返回旧版本内容且播放正常。

## 演练要求

正式发布前至少完成一次回滚演练：部署 v1 → 部署 v2 → 按上述步骤切回 v1 → 验证 v1 可正常访问。演练通过后方可上线。
