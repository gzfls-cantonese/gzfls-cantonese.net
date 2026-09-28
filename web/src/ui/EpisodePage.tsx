import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadEpisode, loadManifest } from '../data/api'
import { useAsync } from '../data/useAsync'
import { usePlayer } from '../player/usePlayer'
import type { EpisodeIndex, Manifest } from '../data/types'
import CoverImage from './CoverImage'
import PlayerBar from './PlayerBar'
import ScriptPanel from './ScriptPanel'
import { formatMinutes } from './HomePage'

export default function EpisodePage() {
  const { episode: epParam } = useParams()
  const episode = Number(epParam)
  const valid = Number.isInteger(episode) && episode >= 1 && episode <= 157

  const manifest = useAsync<Manifest>(() => loadManifest(), [])
  const ep = useAsync<EpisodeIndex>(() => (valid ? loadEpisode(episode) : Promise.reject(new Error('集號無效'))), [
    episode,
    valid,
  ])

  const summary = useMemo(
    () => manifest.data?.episodes.find((e) => e.episode === episode),
    [manifest.data, episode],
  )

  if (!valid)
    return (
      <div className="page center">
        <p className="error">集號無效（應為 1–157）。</p>
        <Link className="btn" to="/">
          返回選集
        </Link>
      </div>
    )

  if (ep.loading) return <div className="page center muted">載入第 {episode} 集…</div>
  if (ep.error)
    return (
      <div className="page center">
        <p className="error">載入失敗：{ep.error}</p>
        <div className="row">
          <button className="btn" onClick={ep.retry}>
            重試
          </button>
          <Link className="btn btn--ghost" to="/">
            返回
          </Link>
        </div>
      </div>
    )
  if (!ep.data) return null

  return <EpisodeView episode={episode} data={ep.data} cover={summary?.cover} title={summary?.title ?? null} />
}

function EpisodeView({
  episode,
  data,
  cover,
  title,
}: {
  episode: number
  data: EpisodeIndex
  cover?: string
  title?: string | null
}) {
  const player = usePlayer({
    episode,
    entries: data.entries,
    episodeTitle: title ?? `第 ${episode} 集`,
  })

  return (
    <div className="page episode">
      <header className="episode__head">
        {cover && <CoverImage cover={cover} episode={episode} className="episode__cover" />}
        <div className="episode__info">
          <Link className="back" to="/">
            ‹ 選集
          </Link>
          <h1>第 {episode} 集</h1>
          <p className="muted">
            {data.count} 段 · {formatMinutes(data.totalDuration)}
          </p>
        </div>
      </header>

      <ScriptPanel entries={data.entries} currentIndex={player.currentIndex} onSelect={player.seekTo} />

      <PlayerBar player={player} total={data.count} />
    </div>
  )
}
