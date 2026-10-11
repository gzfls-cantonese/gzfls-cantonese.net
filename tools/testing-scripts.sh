# 测试阿里云香港区FC云函数调用新加坡ASR服务可用性，预期返回报文  "assessAvailable":true
# 函数触发器地址不写死在仓库里：仓库是公开的，写死等于把匿名可调的端点直接交到
# 攻击者手上（限流与签名策略都是围着它设计的）。用前先导出：
#   export RECORDINGS_FN_URL='https://<你的函数触发器地址>'
: "${RECORDINGS_FN_URL:?请先 export RECORDINGS_FN_URL 为你的函数触发器地址}"
curl -s -X POST "${RECORDINGS_FN_URL}/presign-upload" \
  -H 'content-type: application/json' \
  -H 'x-anon-id: 11111111-1111-4111-8111-111111111111' \
  -d '{"episode":1,"entryId":"sg_001_000","durationSec":5,"mime":"audio/webm"}'

# chrome浏览器 dev-tools -》 console 脚本代码，用于生成webm格式录音，用于测试
const s = await navigator.mediaDevices.getUserMedia({ audio: true });
const rec = new MediaRecorder(s);           // 用浏览器默认 mime，跟前端一致
const chunks = [];
rec.ondataavailable = e => chunks.push(e.data);
rec.onstop = () => {
  const blob = new Blob(chunks, { type: rec.mimeType });
  console.log('实际 mime =', rec.mimeType);  // 记下来，通常是 audio/webm;codecs=opus
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rec-edge.webm';
  a.click();
  s.getTracks().forEach(t => t.stop());
};
rec.start();
console.log('录音中，说 5~8 秒粤语后回车停止…');
// 说完后手动执行下面这行停止：
// rec.stop()

# 检测从单集主页返回首页时是否正常，预期返回 200 text/html
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' https://gzfls-cantonese.net/episode/1