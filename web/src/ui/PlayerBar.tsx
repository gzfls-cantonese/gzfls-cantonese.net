import type { ReactNode } from 'react'
import type { PlayerState } from '../player/usePlayer'
import { useLocale } from '../i18n/locale'
import type { Translator } from '../i18n/messages'

interface Props {
  player: PlayerState
  total: number
  /** Optional record control rendered beside the play/pause button. */
  recordSlot?: ReactNode
}

export default function PlayerBar({ player, total, recordSlot }: Props) {
  const { currentIndex, status, toggle } = player
  const { t } = useLocale()
  const pct = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0
  const playing = status === 'playing'

  return (
    <div className="player-bar">
      <div className="player-bar__progress">
        <div className="player-bar__bar" style={{ width: `${pct}%` }} />
      </div>

      {status === 'error' && player.errorEntryId && (
        <p className="player-bar__error">
          {t('player.skipped.before')}
          <code>{player.errorEntryId}</code>
          {t('player.skipped.after')}
        </p>
      )}

      <div className="player-bar__controls">
        <button
          className="icon-btn icon-btn--main"
          onClick={toggle}
          aria-label={playing ? t('player.pause') : t('player.play')}
        >
          {/* Inline SVG: ▶/⏸ code points render as color emoji on Android,
              ignoring the button's text colour. */}
          {playing ? (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
              <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
              <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5z" />
            </svg>
          )}
        </button>
        {recordSlot}
      </div>

      <div className="player-bar__meta">
        <span>
          {currentIndex + 1} / {total}
        </span>
        <span className="muted">{statusLabel(status, t)}</span>
      </div>
    </div>
  )
}

function statusLabel(status: PlayerState['status'], t: Translator): string {
  switch (status) {
    case 'playing':
      return t('player.status.playing')
    case 'paused':
      return t('player.status.paused')
    case 'ended':
      return t('player.status.ended')
    case 'error':
      return t('player.status.error')
    default:
      return t('player.status.idle')
  }
}
