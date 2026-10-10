import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadEpisode, loadManifest, DataError } from '../data/api'
import { useAsync } from '../data/useAsync'
import { describeDataError } from '../i18n/errors'
import { useLocale } from '../i18n/locale'
import { usePlayer } from '../player/usePlayer'
import { useTrialRecord } from '../data/useTrialRecord'
import { RECORDINGS_API } from '../config'
import type { EpisodeIndex, Manifest } from '../data/types'
import CoverImage from './CoverImage'
import PlayerBar from './PlayerBar'
import ScriptPanel from './ScriptPanel'
import TrialRecorder from './TrialRecorder'
import { toMinutes } from './HomePage'

export default function EpisodePage() {
  const { episode: epParam } = useParams()
  const { t } = useLocale()
  const episode = Number(epParam)
  const valid = Number.isInteger(episode) && episode >= 1 && episode <= 157

  const manifest = useAsync<Manifest>(() => loadManifest(), [])
  const ep = useAsync<EpisodeIndex>(
    () =>
      valid
        ? loadEpisode(episode)
        : Promise.reject(new DataError('invalidEpisode', `episode number out of range: ${epParam}`)),
    [episode, valid],
  )

  const summary = useMemo(
    () => manifest.data?.episodes.find((e) => e.episode === episode),
    [manifest.data, episode],
  )

  if (!valid)
    return (
      <div className="page center">
        <p className="error">{t('error.reason.invalidEpisode')}</p>
        <Link className="btn" to="/">
          {t('nav.backToEpisodes')}
        </Link>
      </div>
    )

  if (ep.loading) return <div className="page center muted">{t('episode.loading', { episode })}</div>
  if (ep.error)
    return (
      <div className="page center">
        <p className="error">{t('error.loadFailed', { reason: describeDataError(ep.error, t) })}</p>
        <div className="row">
          <button className="btn" onClick={ep.retry}>
            {t('action.retry')}
          </button>
          <Link className="btn btn--ghost" to="/">
            {t('nav.back')}
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
    />
  )
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
  const { t } = useLocale()
  const displayTitle = title ?? t('ep.number', { episode })
  // Dataset chapter titles read as two balanced clauses separated by a space;
  // render those stacked so the block lines up with the cover card on the left.
  // The localized fallback is a single phrase and must not be split.
  const titleLines = title ? title.split(/\s+/).filter(Boolean) : []
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
            ‹ {t('nav.episodes')}
          </Link>
          <h1 className="episode__title">
            {titleLines.length >= 2 ? (
              titleLines.map((line, i) => (
                <span className="episode__title-line" key={i}>
                  {line}
                </span>
              ))
            ) : (
              <span className="episode__title-line">{displayTitle}</span>
            )}
          </h1>
          <p className="muted">
            {t('ep.meta', { segments: data.count, minutes: toMinutes(data.totalDuration) })}
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
