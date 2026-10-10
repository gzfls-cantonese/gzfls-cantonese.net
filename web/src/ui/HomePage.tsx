import { Link } from 'react-router-dom'
import { safeExternalUrl } from '../config'
import { loadManifest } from '../data/api'
import { useAsync } from '../data/useAsync'
import { describeDataError } from '../i18n/errors'
import { useLocale } from '../i18n/locale'
import type { Arc, EpisodeSummary, Manifest } from '../data/types'

/** Arc ordinals, locale-independent. Falls back to an Arabic numeral past XII. */
const ARC_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

export default function HomePage() {
  const { data, error, loading, retry } = useAsync<Manifest>(() => loadManifest(), [])
  const { t } = useLocale()

  if (loading) return <div className="page center muted">{t('home.loading')}</div>
  if (error)
    return (
      <ErrorState
        message={describeDataError(error, t)}
        onRetry={retry}
      />
    )
  if (!data) return null

  const arcs = data.arcs?.length ? data.arcs : null

  return (
    <div className="home">
      <section className="hero">
        <h1>{t('home.hero.title')}</h1>
        <p className="hero__sub">{t('home.hero.tagline')}</p>
        <p className="hero__sub">
          {t('home.hero.sub2', { episodes: data.episodeCount, segments: data.recordCount })}
        </p>
      </section>

      <section className="home__mid">
        {arcs ? (
          arcs.map((arc, index) => (
            <section className="arc" key={arc.id}>
              <h2 className="arc__title">
                {t('home.arc.title', {
                  numeral: ARC_NUMERALS[index] ?? String(index + 1),
                  title: arc.title,
                })}
              </h2>
              <EpisodeGrid episodes={episodesInArc(data.episodes, arc)} />
            </section>
          ))
        ) : (
          <EpisodeGrid episodes={data.episodes} />
        )}
      </section>

      <footer className="home__source">
        <span>
          {t('source.datasetLabel')}Hugging Face · <code>CanCLID/zoengjyutgaai</code>
        </span>
        <span>
          {t('source.licenseLabel')}
          <a href={safeExternalUrl(data.licenseUrl)} target="_blank" rel="noreferrer noopener">
            {data.license}
          </a>
        </span>
      </footer>
    </div>
  )
}

function episodesInArc(episodes: EpisodeSummary[], arc: Arc): EpisodeSummary[] {
  return episodes.filter(
    (ep) => ep.arc === arc.id || (ep.arc == null && ep.episode >= arc.fromEpisode && ep.episode <= arc.toEpisode),
  )
}

function EpisodeGrid({ episodes }: { episodes: EpisodeSummary[] }) {
  const { t } = useLocale()
  return (
    <ul className="ep-grid">
      {episodes.map((ep) => {
        const halves = ep.title ? ep.title.split(' ') : null
        return (
          <li key={ep.episode}>
            <Link className="ep-card" to={`/episode/${ep.episode}`}>
              <div className="ep-card__top">
                <span className="ep-card__no">{t('ep.number', { episode: ep.episode })}</span>
                <span className="ep-card__title" title={ep.title ?? undefined}>
                  {halves ? (
                    <>
                      <span className="ep-card__title-line">{halves[0]}</span>
                      <span className="ep-card__title-line">{halves[1] ?? ''}</span>
                    </>
                  ) : (
                    <span className="ep-card__title-line">{t('ep.number', { episode: ep.episode })}</span>
                  )}
                </span>
              </div>
              <div className="ep-card__bottom">
                <span className="ep-card__meta">
                  {t('ep.meta', { segments: ep.count, minutes: toMinutes(ep.totalDuration) })}
                </span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useLocale()
  return (
    <div className="page center">
      <p className="error">{t('error.loadFailed', { reason: message })}</p>
      <button className="btn" onClick={onRetry}>
        {t('action.retry')}
      </button>
    </div>
  )
}

/** Pure rounding; the unit wording belongs to the dictionary so English plurals work. */
export function toMinutes(seconds: number): number {
  return Math.round(seconds / 60)
}
