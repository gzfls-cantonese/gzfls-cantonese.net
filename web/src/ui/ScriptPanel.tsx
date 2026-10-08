import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ScriptEntry } from '../data/types'

interface Props {
  entries: ScriptEntry[]
  currentIndex: number
  onSelect: (index: number) => void
}

/**
 * Renders one transcript entry. When Jyutping is available and enabled, each
 * character becomes a vertical cell (Han on top, its Jyutping below) so the
 * romanization stays aligned per character even when the line wraps. Falls back
 * to plain traditional text when Jyutping is missing or length-mismatched.
 */
function EntryText({ entry, showJyutping }: { entry: ScriptEntry; showJyutping: boolean }) {
  const chars = Array.from(entry.transcription)
  const jp = entry.jyutping
  const aligned = showJyutping && Array.isArray(jp) && jp.length === chars.length

  if (!aligned) {
    return (
      <span className="script__text" lang="zh-Hant">
        {entry.transcription}
      </span>
    )
  }

  return (
    <span className="script__chars">
      {chars.map((ch, i) => (
        <span className="script__cell" key={i}>
          <span className="script__han" lang="zh-Hant">
            {ch}
          </span>
          <span className="script__jp">{jp![i] || ''}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * Virtualized, scroll-synced transcript. The current line is highlighted and
 * kept in view; auto-scroll is suspended while the user scrolls manually and
 * resumes when the playing entry changes (or the user taps a line).
 */
export default function ScriptPanel({ entries, currentIndex, onSelect }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const autoRef = useRef(true)
  const [showJyutping, setShowJyutping] = useState(true)

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 6,
  })

  // A genuine user gesture disables auto-scroll until the entry changes.
  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    const suspend = () => {
      autoRef.current = false
    }
    el.addEventListener('wheel', suspend, { passive: true })
    el.addEventListener('touchmove', suspend, { passive: true })
    return () => {
      el.removeEventListener('wheel', suspend)
      el.removeEventListener('touchmove', suspend)
    }
  }, [])

  // On entry change: re-enable auto-scroll and center the current line.
  useEffect(() => {
    autoRef.current = true
    virtualizer.scrollToIndex(currentIndex, { align: 'center' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // Toggling Jyutping changes every row's height; drop the measurement cache.
  useEffect(() => {
    virtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJyutping])

  const items = virtualizer.getVirtualItems()

  return (
    <div className="script-wrap">
      <div className="script-toolbar">
        <span className="script-hint">可滾屏和點擊跳轉</span>
        <label className="script-toggle">
          <input
            type="checkbox"
            checked={showJyutping}
            onChange={(e) => setShowJyutping(e.target.checked)}
          />
          <span>顯示粵拼Jyutping</span>
        </label>
      </div>
      <div className="script" ref={parentRef}>
        <div className="script__inner" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((v) => {
            const entry = entries[v.index]
            const active = v.index === currentIndex
            return (
              <div
                key={entry.id}
                data-index={v.index}
                ref={virtualizer.measureElement}
                className={`script__row${active ? ' script__row--active' : ''}`}
                style={{ transform: `translateY(${v.start}px)` }}
                onClick={() => onSelect(v.index)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(v.index)
                  }
                }}
              >
                <span className="script__no">{v.index + 1}</span>
                <EntryText entry={entry} showJyutping={showJyutping} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
