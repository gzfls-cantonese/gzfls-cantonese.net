import { Link } from 'react-router-dom'
import { loadManifest } from '../data/api'
import { useAsync } from '../data/useAsync'
import CoverImage from './CoverImage'
import type { Manifest } from '../data/types'

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

  return (
    <div className="page">
      <section className="hero">
        <h1>三國演義 · 粵語評書</h1>
        <p className="hero__sub">
          共 {data.episodeCount} 集 · {data.recordCount.toLocaleString()} 段 · 邊聽邊睇繁体脚本，輕松學粵語
        </p>
      </section>

      <ul className="ep-grid">
        {data.episodes.map((ep) => (
          <li key={ep.episode}>
            <Link className="ep-card" to={`/episode/${ep.episode}`}>
              <CoverImage cover={ep.cover} episode={ep.episode} className="ep-card__cover" />
              <div className="ep-card__body">
                <span className="ep-card__no">第 {ep.episode} 集</span>
                {ep.title && <span className="ep-card__title">{ep.title}</span>}
                <span className="ep-card__meta">
                  {ep.count} 段 · {formatMinutes(ep.totalDuration)}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
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
