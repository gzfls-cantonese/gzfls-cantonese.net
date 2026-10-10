import { useState } from 'react'
import { episodeCoverUrl } from '../data/api'
import { useLocale } from '../i18n/locale'

interface Props {
  cover: string
  episode: number
  className?: string
}

/**
 * Episode cover with lazy loading and a graceful placeholder fallback.
 * Real 小人書 illustrations are pending licensing, so the cover path may 404;
 * we always fall back to an inline placeholder that keeps the layout intact.
 */
export default function CoverImage({ cover, episode, className }: Props) {
  const [failed, setFailed] = useState(false)
  const { t } = useLocale()

  if (failed) {
    return (
      <div
        className={`cover cover--placeholder ${className ?? ''}`}
        aria-label={t('cover.placeholderLabel', { episode })}
      >
        <span className="cover__ep">{t('cover.episodeBadge', { episode })}</span>
      </div>
    )
  }

  return (
    <img
      className={`cover ${className ?? ''}`}
      src={episodeCoverUrl(cover)}
      alt={t('cover.alt', { episode })}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}
