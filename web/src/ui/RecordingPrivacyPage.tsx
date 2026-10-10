import { Link } from 'react-router-dom'
import { useLocale } from '../i18n/locale'
import { richText } from '../i18n/richText'

/**
 * Privacy statement for the trial-recording + AI scoring feature, linked from
 * the recorder dock on each episode page. Describes the actual system behaviour:
 * anon-scoped private OSS storage with no list/download, dispose-on-exit with a
 * 7-day lifecycle fallback, and third-party ASR (Alibaba Model Studio,
 * Singapore) whose score/transcript are never persisted.
 *
 * The `**emphasis**` spans in the dictionary are load-bearing claims, so they
 * are rendered by `richText` rather than dropped into plain text.
 */
export default function RecordingPrivacyPage() {
  const { t } = useLocale()

  return (
    <div className="page recording-privacy">
      <Link className="back" to="/">
        ‹ {t('nav.back')}
      </Link>
      <h1>{t('privacy.title')}</h1>

      <p className="muted">{richText(t('privacy.intro'))}</p>

      <section>
        <h2>{t('privacy.collect.title')}</h2>
        <p>{t('privacy.collect.lead')}</p>
        <ul>
          <li>{richText(t('privacy.collect.audio'))}</li>
          <li>{richText(t('privacy.collect.anonId'))}</li>
        </ul>
      </section>

      <section>
        <h2>{t('privacy.storage.title')}</h2>
        <p>{richText(t('privacy.storage.body'))}</p>
      </section>

      <section>
        <h2>{t('privacy.delete.title')}</h2>
        <p>{richText(t('privacy.delete.body'))}</p>
      </section>

      <section>
        <h2>{t('privacy.scoring.title')}</h2>
        <p>{richText(t('privacy.scoring.how'))}</p>
        <p>{richText(t('privacy.scoring.retention'))}</p>
      </section>

      <section>
        <h2>{t('privacy.reference.title')}</h2>
        <p>
          {t('privacy.reference.body')}
          <Link to="/about">{t('about.title')}</Link>
          {t('privacy.reference.after')}
        </p>
      </section>

      <section>
        <h2>{t('privacy.contact.title')}</h2>
        <p>
          {t('privacy.contact.body')}
          <a href="mailto:gzfls-cantonese@outlook.com">gzfls-cantonese@outlook.com</a>
          {t('privacy.contact.after')}
        </p>
      </section>
    </div>
  )
}
