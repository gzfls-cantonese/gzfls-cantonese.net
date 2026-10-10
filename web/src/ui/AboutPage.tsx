import { useEffect, useState } from 'react'
import { loadManifest } from '../data/api'
import { safeExternalUrl } from '../config'
import { useLocale } from '../i18n/locale'
import type { Manifest } from '../data/types'

export default function AboutPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const { t } = useLocale()

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => setManifest(null))
  }, [])

  const license = manifest?.license ?? 'CC0 1.0 Universal'
  const licenseUrl = safeExternalUrl(
    manifest?.licenseUrl ?? 'https://creativecommons.org/publicdomain/zero/1.0/',
  )
  const source = safeExternalUrl(
    manifest?.source ?? 'https://huggingface.co/datasets/CanCLID/zoengjyutgaai',
  )

  return (
    <div className="page about">
      <h1>{t('about.title')}</h1>
      <p>{t('about.intro')}</p>
      <p>
        {t('about.usage')}
        <a href="mailto:gzfls-cantonese@outlook.com">gzfls-cantonese@outlook.com</a>
      </p>
      <section>
        <h2>{t('about.dataset.title')}</h2>
        <p>
          {t('about.dataset.before')}
          <code>CanCLID/zoengjyutgaai</code>
          {t('about.dataset.after')}
        </p>
        <p className="license-badge">
          <strong>{license}</strong> · Public Domain Dedication
        </p>
        <p>
          <a href={source} target="_blank" rel="noreferrer noopener">
            {t('about.link.dataset')}
          </a>
          {'   ·   '}
          <a href={licenseUrl} target="_blank" rel="noreferrer noopener">
            {t('about.link.license', { license })}
          </a>
        </p>
      </section>
      <section>
        <h2>{t('about.artwork.title')}</h2>
        <p>{t('about.artwork.credits')}</p>
      </section>
    </div>
  )
}
