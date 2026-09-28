import { useState } from 'react'
import { episodeCoverUrl } from '../data/api'

interface Props {
  cover: string
  episode: number
  className?: string
}

const PLACEHOLDER_LABEL = '封面待補'

/**
 * Episode cover with lazy loading and a graceful placeholder fallback.
 * Real 小人书 illustrations are pending licensing, so the cover path may 404;
 * we always fall back to an inline placeholder that keeps the layout intact.
 */
export default function CoverImage({ cover, episode, className }: Props) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div className={`cover cover--placeholder ${className ?? ''}`} aria-label={`第 ${episode} 集封面`}>
        <span className="cover__ep">{String(episode).padStart(3, '0')}</span>
        <span className="cover__label">{PLACEHOLDER_LABEL}</span>
      </div>
    )
  }

  return (
    <img
      className={`cover ${className ?? ''}`}
      src={episodeCoverUrl(cover)}
      alt={`第 ${episode} 集《三國演義》封面`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
