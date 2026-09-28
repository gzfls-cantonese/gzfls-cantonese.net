import type { PlayerState } from '../player/usePlayer'

interface Props {
  player: PlayerState
  total: number
}

export default function PlayerBar({ player, total }: Props) {
  const { currentIndex, status, toggle, next, prev } = player
  const pct = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0
  const playing = status === 'playing'

  return (
    <div className="player-bar">
      <div className="player-bar__progress">
        <div className="player-bar__bar" style={{ width: `${pct}%` }} />
      </div>

      {status === 'error' && player.errorEntryId && (
        <p className="player-bar__error">
          片段 <code>{player.errorEntryId}</code> 暫時無法播放，已自動跳過
        </p>
      )}

      <div className="player-bar__controls">
        <button className="icon-btn" onClick={prev} aria-label="上一条" disabled={currentIndex <= 0}>
          ⏮
        </button>
        <button
          className="icon-btn icon-btn--main"
          onClick={toggle}
          aria-label={playing ? '暂停' : '播放'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          className="icon-btn"
          onClick={next}
          aria-label="下一条"
          disabled={currentIndex >= total - 1}
        >
          ⏭
        </button>
      </div>

      <div className="player-bar__meta">
        <span>
          {currentIndex + 1} / {total}
        </span>
        <span className="muted">{statusLabel(status)}</span>
      </div>
    </div>
  )
}

function statusLabel(status: PlayerState['status']): string {
  switch (status) {
    case 'playing':
      return '播放中'
    case 'paused':
      return '已暂停'
    case 'ended':
      return '本集已結束'
    case 'error':
      return '片段錯誤'
    default:
      return '待播放'
  }
}
