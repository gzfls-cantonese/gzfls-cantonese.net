import { Link } from 'react-router-dom'
import { loadManifest } from '../data/api'
import { useAsync } from '../data/useAsync'
import type { Arc, EpisodeSummary, Manifest } from '../data/types'

export default function HomePage() {
  const { data, error, loading, retry } = useAsync<Manifest>(() => loadManifest(), [])

  if (loading) return <div className="page center muted">載入評書目录…</div>
  if (error)
    return (
      <ErrorState
        message={error}
        onRetry={retry}
      />
    )
  if (!data) return null

  const arcs = data.arcs?.length ? data.arcs : null

  return (
    <div className="page">
      <section className="hero">
        <h1>三國演義 · 粵語評書</h1>
        <p className="hero__sub">
          共 {data.episodeCount} 集 · {data.recordCount.toLocaleString()} 段 · 邊聽邊睇繁体脚本，輕松學粵語
        </p>
      </section>

      {arcs ? (
        arcs.map((arc) => (
          <section className="arc" key={arc.id}>
            <h2 className="arc__title">{arc.title}</h2>
            <EpisodeGrid episodes={episodesInArc(data.episodes, arc)} />
          </section>
        ))
      ) : (
        <EpisodeGrid episodes={data.episodes} />
      )}
    </div>
  )
}

function episodesInArc(episodes: EpisodeSummary[], arc: Arc): EpisodeSummary[] {
  return episodes.filter(
    (ep) => ep.arc === arc.id || (ep.arc == null && ep.episode >= arc.fromEpisode && ep.episode <= arc.toEpisode),
  )
}

function EpisodeGrid({ episodes }: { episodes: EpisodeSummary[] }) {
  return (
    <ul className="ep-grid">
      {episodes.map((ep) => {
        const halves = ep.title ? ep.title.split(' ') : null
        return (
          <li key={ep.episode}>
            <Link className="ep-card" to={`/episode/${ep.episode}`}>
              <div className="ep-card__top">
                <span className="ep-card__no">第 {ep.episode} 集</span>
                <span className="ep-card__title" title={ep.title ?? undefined}>
                  {halves ? (
                    <>
                      <span className="ep-card__title-line">{halves[0]}</span>
                      <span className="ep-card__title-line">{halves[1] ?? ''}</span>
                    </>
                  ) : (
                    <span className="ep-card__title-line">{`第 ${ep.episode} 集`}</span>
                  )}
                </span>
              </div>
              <div className="ep-card__bottom">
                <span className="ep-card__meta">
                  {ep.count} 段 · {formatMinutes(ep.totalDuration)}
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
  return (
    <div className="page center">
      <p className="error">載入失敗：{message}</p>
      <button className="btn" onClick={onRetry}>
        重試
      </button>
    </div>
  )
}

export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60)
  return `${m} 分鐘`
}
