import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadEpisode, loadManifest } from '../data/api'
import { useAsync } from '../data/useAsync'
import { usePlayer } from '../player/usePlayer'
import { useTrialRecord } from '../data/useTrialRecord'
import { RECORDINGS_API } from '../config'
import type { EpisodeIndex, Manifest } from '../data/types'
import CoverImage from './CoverImage'
import PlayerBar from './PlayerBar'
import ScriptPanel from './ScriptPanel'
import TrialRecorder from './TrialRecorder'
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

  const arcName = useMemo(() => {
    const arcs = manifest.data?.arcs
    if (!arcs || summary?.arc == null) return null
    return arcs.find((a) => a.id === summary.arc)?.title ?? null
  }, [manifest.data, summary])

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

  return (
    <EpisodeView
      episode={episode}
      data={ep.data}
      cover={summary?.cover}
      title={summary?.title ?? null}
      arcName={arcName}
    />
  )
}

function EpisodeView({
  episode,
  data,
  cover,
  title,
  arcName,
}: {
  episode: number
  data: EpisodeIndex
  cover?: string
  title?: string | null
  arcName?: string | null
}) {
  const displayTitle = title ?? `第 ${episode} 集`
  const player = usePlayer({
    episode,
    entries: data.entries,
    episodeTitle: displayTitle,
  })

  const currentEntryId = data.entries[player.currentIndex]?.id ?? null
  const trial = useTrialRecord({
    episode,
    entryId: currentEntryId,
    enabled: RECORDINGS_API !== null,
    onNeedsDatasetPause: player.pause,
  })

  // Dataset playback and trial recording are mutually exclusive: starting the
  // dataset (play button, seeking a line, autoplay) destroys the trial.
  const disposeTrial = trial.dispose
  useEffect(() => {
    if (player.status === 'playing') disposeTrial()
  }, [player.status, disposeTrial])

  return (
    <div className="page episode">
      <header className="episode__head">
        {cover && <CoverImage cover={cover} episode={episode} className="episode__cover" />}
        <div className="episode__info">
          <Link className="back" to="/">
            ‹ 選集
          </Link>
          <h1 className="episode__title">{displayTitle}</h1>
          <p className="episode__no">第 {episode} 集{arcName ? ` · ${arcName}` : ''}</p>
          <p className="muted">
            {data.count} 段 · {formatMinutes(data.totalDuration)}
          </p>
        </div>
      </header>

      <ScriptPanel entries={data.entries} currentIndex={player.currentIndex} onSelect={player.seekTo} />

      <PlayerBar
        player={player}
        total={data.count}
        recordSlot={<TrialRecorder api={trial} />}
      />
    </div>
  )
}
