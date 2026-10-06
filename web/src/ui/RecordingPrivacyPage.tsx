import { Link } from 'react-router-dom'

/**
 * Privacy statement for the trial-recording + AI scoring feature, linked from
 * the recorder dock on each episode page. Written in traditional Chinese to
 * match the rest of the UI. Describes the actual system behaviour: anon-scoped
 * private OSS storage with no list/download, dispose-on-exit with a 7-day
 * lifecycle fallback, and third-party ASR (Alibaba Model Studio, Singapore)
 * whose score/transcript are never persisted.
 */
export default function RecordingPrivacyPage() {
  return (
    <div className="page recording-privacy">
      <Link className="back" to="/">
        ‹ 返回
      </Link>
      <h1>錄音和AI評分隱私處理聲明</h1>

      <p className="muted">
        本聲明說明「當前小節試講和AI評分」功能如何處理你的錄音。核心原則：<strong>只用於給你本人這一段試講做粵語發音評分，不作他用；不註冊、不收集身份資料；退出即銷毀。</strong>
      </p>

      <section>
        <h2>一、我們收集什麼</h2>
        <p>
          僅兩項，且都只在本次瀏覽器會話內產生：
        </p>
        <ul>
          <li>你長按錄下的<strong>這一段試講音頻</strong>；</li>
          <li>瀏覽器本地隨機生成的一個<strong>匿名 ID</strong>，只用來把你的錄音與別人隔離開，不含姓名、手機、郵箱等任何身份資料。</li>
        </ul>
      </section>

      <section>
        <h2>二、錄音存放在哪裡、誰能存取</h2>
        <p>
          錄音上傳到阿里雲 OSS 的<strong>私有前綴</strong>下，並按匿名 ID 隔離。服務端<strong>只簽發「上傳」與「刪除」兩類操作，沒有任何列表或下載接口</strong>；物件路徑一律由服務端在你的匿名前綴下重建，客戶端無法傳入完整路徑，因此<strong>任何人都無法枚舉、尋址或下載他人的錄音</strong>。
        </p>
      </section>

      <section>
        <h2>三、什麼時候刪除</h2>
        <p>
          你離開或關閉頁面時，客戶端會<strong>主動請求刪除</strong>本次會話的錄音（含重試與頁面卸載時的兜底發送）。即使刪除請求因崩潰或斷網未送達，OSS 的<strong>生命週期規則會在 7 天後自動清除</strong>該前綴下的所有物件，不會長期駐留。
        </p>
      </section>

      <section>
        <h2>四、AI 評分如何處理你的錄音</h2>
        <p>
          當你點「評分」時，服務端會為你的錄音簽發一個<strong>短時、唯讀</strong>的連結，交給<strong>阿里雲百煉（Model Studio，新加坡地域）</strong>的粵語語音識別模型轉寫，再與該小節的原文比對，得出 0–100 分。這一步會把你的錄音交給<strong>第三方 AI 服務</strong>處理，特此告知。
        </p>
        <p>
          評分結果<strong>不被持久化</strong>：<strong>分數與轉寫文本只在這次請求中返回給你、用完即棄，不寫回任何存儲</strong>；錄音本身仍按上述第三點銷毀。
        </p>
      </section>

      <section>
        <h2>五、比對用的參考文本</h2>
        <p>
          評分所用的原文來自公開的粵語評書數據集（CC0 1.0 公有領域），詳見 <Link to="/about">關於本站</Link>。
        </p>
      </section>

      <section>
        <h2>六、聯繫方式</h2>
        <p>
          如對本聲明或你的錄音處理有任何疑問，請聯繫 <a href="mailto:gzfls-cantonese@outlook.com">gzfls-cantonese@outlook.com</a>。
        </p>
      </section>
    </div>
  )
}
