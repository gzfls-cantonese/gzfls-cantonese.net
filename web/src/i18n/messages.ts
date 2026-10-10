/**
 * Two-locale message dictionary.
 *
 * `Messages` is the single source of truth for keys and the dictionary is typed
 * `Record<Locale, Messages>`, so declaring a key without an `en` value is a
 * compile error caught by `tsc --noEmit`. Values are plain strings, or functions
 * when the text embeds a runtime value — functions rather than `{token}`
 * templates so English plurals are handled inline and argument names stay
 * type-checked.
 *
 * Locale names are deliberately identical in both dictionaries: a visitor who
 * cannot read the current locale must still be able to recognise their own.
 */
export type Locale = 'zh-Hant' | 'en'

export const LOCALES = ['zh-Hant', 'en'] as const

export const DEFAULT_LOCALE: Locale = 'zh-Hant'

export interface Messages {
  'doc.title': string
  'nav.episodes': string
  'nav.about': string
  'locale.switcher.label': string
  'locale.name.zh-Hant': string
  'locale.name.en': string
  'locale.abbr.zh-Hant': string
  'locale.abbr.en': string
  'brand.text': string
  'source.datasetLabel': string
  'source.licenseLabel': string
  'home.loading': string
  'home.hero.title': string
  'home.hero.tagline': string
  'home.hero.sub2': (args: { episodes: number; segments: number }) => string
  /**
   * Arc heading. The title itself is curated literary content and is never
   * translated; English only prepends its ordinal so a visitor can refer to a
   * part. `zh-Hant` returns the title untouched.
   */
  'home.arc.title': (args: { numeral: string; title: string }) => string
  'ep.number': (args: { episode: number }) => string
  'ep.meta': (args: { segments: number; minutes: number }) => string
  'episode.loading': (args: { episode: number }) => string
  'script.hint': string
  'script.jyutpingToggle': string
  'player.play': string
  'player.pause': string
  'player.status.playing': string
  'player.status.paused': string
  'player.status.ended': string
  'player.status.error': string
  'player.status.idle': string
  'player.skipped.before': string
  'player.skipped.after': string
  'player.mediaFallbackTitle': string
  'player.mediaAlbum': string
  'error.reason.network': string
  'error.reason.http': (args: { status?: number }) => string
  'error.reason.parse': string
  'error.reason.unexpected': string
  'error.reason.invalidEpisode': string
  'error.loadFailed': (args: { reason: string }) => string
  'action.retry': string
  'nav.back': string
  'nav.backToEpisodes': string
  'notFound.title': string
  'notFound.body': string
  'about.title': string
  'about.intro': string
  'about.usage': string
  'about.dataset.title': string
  'about.dataset.before': string
  'about.dataset.after': string
  'about.link.dataset': string
  'about.link.license': (args: { license: string }) => string
  'privacy.title': string
  'privacy.intro': string
  'privacy.collect.title': string
  'privacy.collect.lead': string
  'privacy.collect.audio': string
  'privacy.collect.anonId': string
  'privacy.storage.title': string
  'privacy.storage.body': string
  'privacy.delete.title': string
  'privacy.delete.body': string
  'privacy.scoring.title': string
  'privacy.scoring.how': string
  'privacy.scoring.retention': string
  'privacy.reference.title': string
  'privacy.reference.body': string
  'privacy.reference.after': string
  'privacy.contact.title': string
  'privacy.contact.body': string
  'privacy.contact.after': string
  'trial.error.scoringUnavailable': string
  'trial.error.rateLimited': string
  'trial.error.destroyed': string
  'trial.error.timeout': string
  'trial.error.unknown': string
  'trial.error.unsupportedFormat': string
  'trial.error.micDenied': string
  'trial.recordButton': string
  'trial.caption': string
  'trial.holdingPrompt': string
  'trial.privacyLink': string
  'trial.uploading': string
  'trial.assess': string
  'trial.assessing': string
  'trial.replay': string
  'trial.pauseReplay': string
  'trial.score': (args: { score: number }) => string
  'trial.languageWarning': string
  'cover.alt': (args: { episode: number }) => string
  'cover.placeholderLabel': (args: { episode: number }) => string
  'cover.episodeBadge': (args: { episode: number }) => string
}

const zhHant: Messages = {
  'doc.title': '品三國 · 識粵語',
  'nav.episodes': '選集',
  'nav.about': '關於',
  'locale.switcher.label': '界面語言',
  'locale.name.zh-Hant': '繁體中文',
  'locale.name.en': 'English',
  'locale.abbr.zh-Hant': '中',
  'locale.abbr.en': 'Eng',
  'brand.text': '粵語評書',
  'source.datasetLabel': '語料來源：',
  'source.licenseLabel': '數據許可協議：',
  'home.loading': '載入評書目錄…',
  'home.hero.title': '三國演義 · 張悅楷先生經典評書',
  'home.hero.tagline': '聽楷叔講古，品中華史詩，學標準粵語',
  'home.hero.sub2': ({ episodes, segments }) => `共 ${episodes} 集，${segments.toLocaleString()} 段`,
  // `numeral` is intentionally unused: the Chinese interface already numbers the
  // parts in prose, and the arc names are content rather than chrome.
  'home.arc.title': ({ title }) => title,
  'ep.number': ({ episode }) => `第 ${episode} 集`,
  'ep.meta': ({ segments, minutes }) => `${segments} 段 · ${minutes} 分鐘`,
  'episode.loading': ({ episode }) => `載入第 ${episode} 集…`,
  'script.hint': '可滾屏和點擊跳轉',
  'script.jyutpingToggle': '顯示粵拼Jyutping',
  'player.play': '播放',
  'player.pause': '暫停',
  'player.status.playing': '播放中',
  'player.status.paused': '已暫停',
  'player.status.ended': '本集已結束',
  'player.status.error': '片段錯誤',
  'player.status.idle': '待播放',
  'player.skipped.before': '片段 ',
  'player.skipped.after': ' 暫時無法播放，已自動跳過',
  'player.mediaFallbackTitle': '三國演義粵語評書',
  'player.mediaAlbum': '三國演義 · 粵語評書',
  'error.reason.network': '網絡錯誤，無法連線伺服器',
  'error.reason.http': ({ status }) => (status ? `請求失敗（${status}）` : '請求失敗'),
  'error.reason.parse': '返回內容不是有效的 JSON',
  'error.reason.unexpected': '載入時發生錯誤',
  'error.reason.invalidEpisode': '集號無效（應為 1–157）。',
  'error.loadFailed': ({ reason }) => `載入失敗：${reason}`,
  'action.retry': '重試',
  'nav.back': '返回',
  'nav.backToEpisodes': '返回選集',
  'notFound.title': '頁面不存在',
  'notFound.body': '返回首頁繼續聽評書。',
  'about.title': '關於本站',
  'about.intro':
    '品三國，識粵語。用粵語地區膾炙人口的張悅楷《三國演義》評書，亦即楷叔講古仔，品味粵語之古雅又生鬼，又在經典中學習當代的粵拼Jyutping國際音標，豈不樂哉。',
  'about.usage': '本站所有內容，只用於中華文化推廣，遵循開放版權約定，如有內容問題，請聯繫 ',
  'about.dataset.title': '語料數據集來源',
  'about.dataset.before': '本站粵語評書音頻與繁體腳本，來自 huggingface 社區 ',
  'about.dataset.after': ' “張悅楷講古語音-三國演義子數據集”，共 157 集、3.92 萬段，數據集許可證： ',
  'about.link.dataset': '數據集主頁',
  'about.link.license': ({ license }) => `${license} 許可證全文`,
  'privacy.title': '錄音和AI評分隱私處理聲明',
  'privacy.intro':
    '本聲明說明「當前小節試講和AI評分」功能如何處理你的錄音。核心原則：**只用於給你本人這一段試講做粵語發音評分，不作他用；不註冊、不收集身份資料；退出即銷毀。**',
  'privacy.collect.title': '一、我們收集什麼',
  'privacy.collect.lead': '僅兩項：',
  'privacy.collect.audio': '你長按錄下的**這一段試講音頻**；',
  'privacy.collect.anonId':
    '瀏覽器本地隨機生成、並保存在本機 localStorage 的一個**匿名 ID**，跨會話穩定，只用來把你的錄音與別人隔離開，不含姓名、手機、郵箱等任何身份資料。',
  'privacy.storage.title': '二、錄音存放在哪裡、誰能存取',
  'privacy.storage.body':
    '錄音上傳到阿里雲 OSS 的**私有前綴**下，並按匿名 ID 隔離。服務端**只簽發「上傳」與「刪除」兩類操作，沒有任何列表或下載接口**；物件路徑一律由服務端在你的匿名前綴下重建，客戶端無法傳入完整路徑，因此**任何人都無法枚舉、尋址或下載他人的錄音**。',
  'privacy.delete.title': '三、什麼時候刪除',
  'privacy.delete.body':
    '你離開或關閉頁面時，客戶端會**主動請求刪除**本次會話的錄音（含頁面卸載時的兜底發送）。刪除**只嘗試一次，失敗不重試**；即使請求因崩潰或斷網未送達，OSS 的**生命週期規則會在 7 天後自動清除**該前綴下的所有物件，不會長期駐留。',
  'privacy.scoring.title': '四、AI 評分如何處理你的錄音',
  'privacy.scoring.how':
    '當你點「評分」時，服務端會為你的錄音簽發一個**短時、唯讀**的連結，交給**阿里雲百煉（Model Studio，新加坡地域）**的粵語語音識別模型轉寫，再與該小節的原文比對，得出 0–100 分。這一步會把你的錄音交給**第三方 AI 服務**處理，特此告知。',
  'privacy.scoring.retention':
    '評分結果**不被持久化**：**分數與轉寫文本只在這次請求中返回給你、用完即棄，不寫回任何存儲**；錄音本身仍按上述第三點銷毀。',
  'privacy.reference.title': '五、比對用的參考文本',
  'privacy.reference.body': '評分所用的原文來自公開的粵語評書數據集（CC0 1.0 公有領域），詳見 ',
  'privacy.reference.after': '。',
  'privacy.contact.title': '六、聯繫方式',
  'privacy.contact.body': '如對本聲明或你的錄音處理有任何疑問，請聯繫 ',
  'privacy.contact.after': '。',
  'trial.error.scoringUnavailable': '評分服務未啟用',
  'trial.error.rateLimited': '評分太頻繁，請稍後再試',
  'trial.error.destroyed': '錄音已銷毀，無法評分',
  'trial.error.timeout': '評分逾時，請稍後再試',
  'trial.error.unknown': '評分失敗，請稍後再試',
  'trial.error.unsupportedFormat': '此瀏覽器不支援錄音格式',
  'trial.error.micDenied': '無法存取麥克風，請檢查授權',
  'trial.recordButton': '長按錄音',
  'trial.caption': '長按-鬆開，朗讀錄製當前小節和AI評分',
  'trial.holdingPrompt': '你就係楷叔，快滴講尼段古仔吧',
  'trial.privacyLink': '隱私和AI評分說明',
  'trial.uploading': '上傳中…',
  'trial.assess': '評分',
  'trial.assessing': '評分中…',
  'trial.replay': '回放錄音',
  'trial.pauseReplay': '暫停回放',
  'trial.score': ({ score }) => `${score}分`,
  'trial.languageWarning': '偵測到非粵語發音，建議用粵語朗讀',
  'cover.alt': ({ episode }) => `第 ${episode} 集《三國演義》封面`,
  'cover.placeholderLabel': ({ episode }) => `第 ${episode} 集封面`,
  'cover.episodeBadge': ({ episode }) => `第${episode}集`,
}

const en: Messages = {
  'doc.title': 'Savor the Three Kingdoms · Learn Cantonese',
  'nav.episodes': 'Episodes',
  'nav.about': 'About',
  'locale.switcher.label': 'Interface language',
  'locale.name.zh-Hant': '繁體中文',
  'locale.name.en': 'English',
  'locale.abbr.zh-Hant': '中',
  'locale.abbr.en': 'Eng',
  'brand.text': 'Cantonese Tales',
  'source.datasetLabel': 'Source: ',
  'source.licenseLabel': 'License: ',
  'home.loading': 'Loading the catalogue…',
  'home.hero.title': 'Romance of the Three Kingdoms: Classic Cantonese Storytelling by Zhang Yuekai',
  'home.hero.tagline': 'Learn Authentic Cantonese Through a Chinese Epic',
  'home.hero.sub2': ({ episodes, segments }) =>
    `${episodes} ${episodes === 1 ? 'episode' : 'episodes'}, ${segments.toLocaleString()} ${segments === 1 ? 'segment' : 'segments'}`,
  'home.arc.title': ({ numeral, title }) => `Part ${numeral}. ${title}`,
  'ep.number': ({ episode }) => `Episode ${episode}`,
  'ep.meta': ({ segments, minutes }) =>
    `${segments} ${segments === 1 ? 'segment' : 'segments'}, ${minutes} min`,
  'episode.loading': ({ episode }) => `Loading episode ${episode}…`,
  'script.hint': 'Scroll, or tap a line to jump to it',
  'script.jyutpingToggle': 'Show Jyutping',
  'player.play': 'Play',
  'player.pause': 'Pause',
  'player.status.playing': 'Playing',
  'player.status.paused': 'Paused',
  'player.status.ended': 'Episode finished',
  'player.status.error': 'Segment error',
  'player.status.idle': 'Ready',
  'player.skipped.before': 'Segment ',
  'player.skipped.after': ' cannot play right now and was skipped',
  'player.mediaFallbackTitle': 'Cantonese Tales',
  'player.mediaAlbum': 'Three Kingdoms · Cantonese Storytelling',
  'error.reason.network': 'Network error — could not reach the server',
  'error.reason.http': ({ status }) => (status ? `Request failed (${status})` : 'Request failed'),
  'error.reason.parse': 'The response was not valid JSON',
  'error.reason.unexpected': 'Something went wrong while loading',
  'error.reason.invalidEpisode': 'Invalid episode number (must be 1–157).',
  'error.loadFailed': ({ reason }) => `Failed to load: ${reason}`,
  'action.retry': 'Retry',
  'nav.back': 'Back',
  'nav.backToEpisodes': 'Back to episodes',
  'notFound.title': 'Page not found',
  'notFound.body': 'Head back to the episodes and keep listening.',
  'about.title': 'About this site',
  'about.intro':
    'Savor the Three Kingdoms, learn Cantonese. This site builds on Zhang Yuekai’s Romance of the Three Kingdoms storytelling — beloved across the Cantonese-speaking world, and known to listeners simply as Uncle Kai telling tales — so you can taste how Cantonese is at once classical and wickedly vivid, and pick up modern Jyutping romanization from a classic along the way.',
  'about.usage':
    'Everything here is published only to promote Chinese culture, under the open-license terms of its sources. If any content is a problem, please contact ',
  'about.dataset.title': 'Corpus sources',
  'about.dataset.before':
    'The Cantonese storytelling audio and the Traditional Chinese scripts on this site come from the Hugging Face community dataset ',
  'about.dataset.after':
    ' — its “張悅楷講古語音-三國演義子數據集” subset — 157 episodes and 39,173 segments. Dataset license: ',
  'about.link.dataset': 'Dataset homepage',
  'about.link.license': ({ license }) => `Read the full ${license} license`,
  'privacy.title': 'Recording and AI Scoring Privacy Statement',
  'privacy.intro':
    'This statement explains how the “record this line and score it with AI” feature handles your recording. The core principle: **it is used only to score the Cantonese pronunciation of your own take on this one line, and for nothing else; there is no sign-up and no identity data collected; it is destroyed when you leave.**',
  'privacy.collect.title': '1. What we collect',
  'privacy.collect.lead': 'Two things only:',
  'privacy.collect.audio': 'the audio of **this one take**, recorded while you hold the button;',
  'privacy.collect.anonId':
    'an **anonymous ID** generated at random in your browser and stored in this device’s localStorage. It is stable across sessions and exists only to keep your recordings separate from other people’s; it holds no name, phone number, email address, or any other identity data.',
  'privacy.storage.title': '2. Where the recording is kept, and who can reach it',
  'privacy.storage.body':
    'Recordings are uploaded under a **private prefix** in Alibaba Cloud OSS, isolated by anonymous ID. The server **issues only “upload” and “delete” operations — there is no list endpoint and no download endpoint**; object paths are always rebuilt server-side under your own anonymous prefix and the client cannot supply a full path, so **no one can enumerate, address, or download anyone else’s recording**.',
  'privacy.delete.title': '3. When it is deleted',
  'privacy.delete.body':
    'When you leave or close the page, the client **actively asks for this session’s recording to be deleted** (including an unload-safe fallback send). Deletion is **attempted once and is not retried**; even if the request never arrives because of a crash or a dropped connection, the OSS **lifecycle rule removes every object under that prefix after 7 days**, so nothing lingers.',
  'privacy.scoring.title': '4. How AI scoring handles your recording',
  'privacy.scoring.how':
    'When you tap “Score it”, the server signs a **short-lived, read-only** URL for your recording and hands it to the Cantonese speech-recognition model of **Alibaba Cloud Model Studio (Singapore region)**, which transcribes it; the transcript is then compared against this line’s reference text to produce a score from 0 to 100. This step gives your recording to a **third-party AI service**, and we say so plainly.',
  'privacy.scoring.retention':
    'The result is **not persisted**: **the score and the transcript are returned to you in that request alone and discarded — nothing is written back to any storage**. The recording itself is still destroyed as described in section 3.',
  'privacy.reference.title': '5. The reference text used for comparison',
  'privacy.reference.body':
    'The reference text used for scoring comes from a public Cantonese storytelling dataset (CC0 1.0, public domain); see ',
  'privacy.reference.after': '.',
  'privacy.contact.title': '6. Contact',
  'privacy.contact.body':
    'If you have any question about this statement or about how your recording is handled, please contact ',
  'privacy.contact.after': '.',
  'trial.error.scoringUnavailable': 'Scoring is not enabled',
  'trial.error.rateLimited': 'Too many scoring requests — try again later',
  'trial.error.destroyed': 'That recording was already destroyed',
  'trial.error.timeout': 'Scoring timed out — try again later',
  'trial.error.unknown': 'Scoring failed — try again later',
  'trial.error.unsupportedFormat': 'This browser supports no recording format',
  'trial.error.micDenied': 'Cannot access the microphone — check the permission',
  'trial.recordButton': 'Hold to record',
  // Kept under 180px: `.trial-caption` is nowrap and centered on the mic button,
  // which sits 90px from the right edge at a 320px viewport, so any extra width
  // becomes page-level horizontal overflow.
  'trial.caption': 'Hold to record, then score with AI',
  'trial.holdingPrompt': "You are the storyteller now — go on, tell this part",
  'trial.privacyLink': 'Privacy and AI scoring',
  'trial.uploading': 'Uploading…',
  'trial.assess': 'Score it',
  'trial.assessing': 'Scoring…',
  'trial.replay': 'Play back my recording',
  'trial.pauseReplay': 'Pause playback',
  'trial.score': ({ score }) => `${score} pts`,
  'trial.languageWarning': 'That did not sound like Cantonese — try reading it in Cantonese',
  'cover.alt': ({ episode }) => `Cover for episode ${episode} of Romance of the Three Kingdoms`,
  'cover.placeholderLabel': ({ episode }) => `Cover for episode ${episode}`,
  'cover.episodeBadge': ({ episode }) => `EP ${episode}`,
}

export const MESSAGES: Record<Locale, Messages> = {
  'zh-Hant': zhHant,
  en,
}

/** Keys whose value is a plain string. */
export type StringKey = {
  [K in keyof Messages]: Messages[K] extends string ? K : never
}[keyof Messages]

/** Keys whose value interpolates runtime arguments. */
export type FnKey = {
  [K in keyof Messages]: Messages[K] extends (args: never) => string ? K : never
}[keyof Messages]

/**
 * The translator. Overloaded so a string key takes no arguments and a function
 * key requires exactly the arguments its message declares.
 */
export interface Translator {
  <K extends StringKey>(key: K): string
  <K extends FnKey>(key: K, args: Parameters<Messages[K]>[0]): string
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}
