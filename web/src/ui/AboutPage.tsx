import { useEffect, useState } from 'react'
import { loadManifest } from '../data/api'
import type { Manifest } from '../data/types'

export default function AboutPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null)

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => setManifest(null))
  }, [])

  const license = manifest?.license ?? 'CC0 1.0 Universal'
  const licenseUrl = manifest?.licenseUrl ?? 'https://creativecommons.org/publicdomain/zero/1.0/'
  const source = manifest?.source ?? 'https://huggingface.co/datasets/CanCLID/zoengjyutgaai'

  return (
    <div className="page about">
      <h1>關於本站</h1>
      <p>
        品三國，識粵語。用粵語地區膾炙人口的張悅楷《三國演義》評書，亦即楷叔講古仔，品味粵語之古雅又生鬼，又在經典中學習當代的粵拼Jyutping國際音標，豈不樂哉。
      </p>
      <p>
        本站所有內容，只用於中華文化推廣，遵循開放版權約定，如有內容問題，請聯繫 <a href="mailto:gzfls-cantonese@outlook.com">gzfls-cantonese@outlook.com</a>
      </p>
      <section>
        <h2>語料數據集來源</h2>
        <p>
          本站粵語評書音頻與繁體脚本，來自 huggingface 社區 <code>CanCLID/zoengjyutgaai</code>  “張悅楷講古語音-三國演義子數據集”，共 157 集、3.92 萬段，數據集許可證： 
        </p>
        <p className="license-badge">
          <strong>{license}</strong> · Public Domain Dedication
        </p>
        <p>
          <a href={source} target="_blank" rel="noreferrer noopener">數據集主頁</a>
          {'   ·   '}
          <a href={licenseUrl} target="_blank" rel="noreferrer noopener">{license} 許可證全文</a>
        </p>
      </section>
    </div>
  )
}
