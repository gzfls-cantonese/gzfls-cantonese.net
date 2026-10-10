import { useCallback, useEffect, useRef, useState } from 'react'
import { episodeAudioUrl } from '../data/api'
import { useLocale } from '../i18n/locale'
import type { ScriptEntry } from '../data/types'

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'ended' | 'error'

export interface PlayerState {
  currentIndex: number
  status: PlayerStatus
  errorEntryId: string | null
  play: () => void
  pause: () => void
  toggle: () => void
  next: () => void
  prev: () => void
  seekTo: (index: number) => void
}

interface Options {
  episode: number
  entries: ScriptEntry[]
  episodeTitle?: string
}

const MAX_CONSECUTIVE_ERRORS = 5

/**
 * Gapless-ish continuous playback over a list of short OPUS clips using two
 * alternating <audio> elements: while one plays, the other preloads the next
 * clip so the swap on `ended` has no network gap. Integrates the Media Session
 * API so mobile keeps playing with the screen off and exposes lock-screen
 * controls. Degrades gracefully where Media Session is unsupported.
 */
export function usePlayer({ episode, entries, episodeTitle }: Options): PlayerState {
  const { t } = useLocale()
  const elsRef = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null])
  const slotRef = useRef(0)
  const indexRef = useRef(0)
  const entriesRef = useRef<ScriptEntry[]>(entries)
  const errorsRef = useRef(0)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [status, setStatus] = useState<PlayerStatus>('idle')
  const [errorEntryId, setErrorEntryId] = useState<string | null>(null)

  entriesRef.current = entries

  const urlAt = useCallback(
    (i: number) => {
      const e = entriesRef.current[i]
      return e ? episodeAudioUrl(e) : null
    },
    [],
  )

  const getEl = useCallback((slot: number) => {
    if (!elsRef.current[slot]) {
      const el = new Audio()
      el.preload = 'auto'
      elsRef.current[slot] = el
    }
    return elsRef.current[slot]!
  }, [])

  const preload = useCallback(
    (slot: number, i: number) => {
      const url = urlAt(i)
      const el = getEl(slot)
      if (url && el.src !== url) {
        el.src = url
        el.load()
      }
    },
    [getEl, urlAt],
  )

  // Central routine to start playback of a given index on a given slot.
  const startIndex = useCallback(
    (i: number, slot: number, autoplay: boolean) => {
      const list = entriesRef.current
      if (i < 0 || i >= list.length) {
        setStatus('ended')
        return
      }
      indexRef.current = i
      slotRef.current = slot
      setCurrentIndex(i)
      setErrorEntryId(null)

      const el = getEl(slot)
      const url = urlAt(i)!
      if (el.src !== url) {
        el.src = url
        el.load()
      }
      preload(1 - slot, i + 1)

      if (autoplay) {
        const p = el.play()
        if (p && typeof p.then === 'function') {
          p.then(() => setStatus('playing')).catch(() => setStatus('paused'))
        } else {
          setStatus('playing')
        }
      } else {
        setStatus('paused')
      }
    },
    [getEl, preload, urlAt],
  )

  const advance = useCallback(
    (from: number, dir: 1 | -1, autoplay: boolean) => {
      const target = from + dir
      if (target < 0) return
      if (target >= entriesRef.current.length) {
        setStatus('ended')
        return
      }
      // Swap to the other slot (which was preloaded for `target` when dir===1).
      startIndex(target, 1 - slotRef.current, autoplay)
    },
    [startIndex],
  )

  // Attach ended/error listeners once; they read refs for latest state.
  useEffect(() => {
    const els = [getEl(0), getEl(1)]
    const onEnded = (ev: Event) => {
      const el = ev.currentTarget as HTMLAudioElement
      if (el !== elsRef.current[slotRef.current]) return
      errorsRef.current = 0
      advance(indexRef.current, 1, true)
    }
    const onError = (ev: Event) => {
      const el = ev.currentTarget as HTMLAudioElement
      if (el !== elsRef.current[slotRef.current]) return
      const failed = entriesRef.current[indexRef.current]
      errorsRef.current += 1
      setErrorEntryId(failed?.id ?? null)
      setStatus('error')
      if (errorsRef.current < MAX_CONSECUTIVE_ERRORS) {
        // Skip the broken clip and keep going.
        advance(indexRef.current, 1, true)
      }
    }
    els.forEach((el) => {
      el.addEventListener('ended', onEnded)
      el.addEventListener('error', onError)
    })
    return () => {
      els.forEach((el) => {
        el.removeEventListener('ended', onEnded)
        el.removeEventListener('error', onError)
        el.pause()
        el.removeAttribute('src')
      })
    }
  }, [advance, getEl])

  // Reset when the episode/entries change.
  useEffect(() => {
    errorsRef.current = 0
    indexRef.current = 0
    setCurrentIndex(0)
    setStatus('idle')
    setErrorEntryId(null)
    elsRef.current.forEach((el) => {
      if (el) {
        el.pause()
        el.removeAttribute('src')
      }
    })
  }, [episode, entries])

  const play = useCallback(() => {
    const el = getEl(slotRef.current)
    if (!el.src) {
      startIndex(indexRef.current, slotRef.current, true)
      return
    }
    const p = el.play()
    if (p && typeof p.then === 'function') {
      p.then(() => setStatus('playing')).catch(() => setStatus('paused'))
    } else {
      setStatus('playing')
    }
  }, [getEl, startIndex])

  const pause = useCallback(() => {
    const el = elsRef.current[slotRef.current]
    if (el) el.pause()
    setStatus('paused')
  }, [])

  const toggle = useCallback(() => {
    const el = elsRef.current[slotRef.current]
    if (status === 'playing' || (el && !el.paused && el.src)) pause()
    else play()
  }, [status, pause, play])

  const next = useCallback(() => {
    errorsRef.current = 0
    advance(indexRef.current, 1, status === 'playing')
  }, [advance, status])

  const prev = useCallback(() => {
    errorsRef.current = 0
    advance(indexRef.current, -1, status === 'playing')
  }, [advance, status])

  const seekTo = useCallback(
    (i: number) => {
      errorsRef.current = 0
      startIndex(i, slotRef.current, true)
    },
    [startIndex],
  )

  // Media Session integration.
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined
    if (!ms) return
    const entry = entriesRef.current[currentIndex]
    try {
      ms.metadata = new MediaMetadata({
        title: entry ? `${entry.id}` : t('player.mediaFallbackTitle'),
        artist: episodeTitle ?? t('ep.number', { episode }),
        album: t('player.mediaAlbum'),
      })
      ms.playbackState = status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none'
      ms.setActionHandler('play', () => play())
      ms.setActionHandler('pause', () => pause())
      ms.setActionHandler('previoustrack', () => prev())
      ms.setActionHandler('nexttrack', () => next())
    } catch {
      // Unsupported action or metadata; ignore and keep foreground playback.
    }
    return () => {
      try {
        ms.setActionHandler('play', null)
        ms.setActionHandler('pause', null)
        ms.setActionHandler('previoustrack', null)
        ms.setActionHandler('nexttrack', null)
      } catch {
        /* noop */
      }
    }
  }, [currentIndex, status, episode, episodeTitle, play, pause, prev, next, t])

  return { currentIndex, status, errorEntryId, play, pause, toggle, next, prev, seekTo }
}
