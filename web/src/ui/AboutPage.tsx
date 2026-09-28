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

      <section>
        <h2>語料來源</h2>
        <p>
          本站粵語評書音頻與繁体脚本來自 Hugging Face 上的 CanCLID <code>zoengjyutgaai</code>
          《三國演義》粵語評書數據集，共 157 集、約 3.9 萬段。
        </p>
        <p>
          數據集主頁：
          <a href={source} target="_blank" rel="noreferrer noopener">
            {source}
          </a>
        </p>
      </section>

      <section>
        <h2>授權許可</h2>
        <p className="license-badge">
          <strong>{license}</strong> · Public Domain Dedication
        </p>
        <p>
          該數據集以 {license} 授權釋出，可自由使用。許可證全文：
          <a href={licenseUrl} target="_blank" rel="noreferrer noopener">
            {licenseUrl}
          </a>
        </p>
      </section>

      <section>
        <h2>插圖版權</h2>
        <p>
          各集《三國演義》小人書插圖的來源與授權尚待確認，在此之前一律使用佔位圖，本站不展示任何未授權圖片。
        </p>
      </section>
    </div>
  )
}
