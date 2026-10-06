import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { attachLongPress } from '../data/recorder'
import type { TrialRecordApi } from '../data/useTrialRecord'

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M18 12a6 6 0 0 1-5 5.91V21h-2v-3.09A6 6 0 0 1 6 12h2a4 4 0 0 0 8 0z" />
    </svg>
  )
}

/**
 * Press-and-hold trial recorder: a round mic button with a caption, a prompt
 * overlay while holding, and a voice bubble afterwards for local playback plus
 * an on-demand scoring entry (shown only when the server can score).
 */
export default function TrialRecorder({ api }: { api: TrialRecordApi }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const { supported } = api

  // begin/end change identity as the state machine advances; hold them in refs
  // so the long-press listener is attached once and its internal pressed-state
  // survives a re-render mid-gesture (otherwise release would be ignored).
  const beginRef = useRef(api.begin)
  const endRef = useRef(api.end)
  beginRef.current = api.begin
  endRef.current = api.end

  useEffect(() => {
    const el = btnRef.current
    if (!el) return
    return attachLongPress(el, {
      onStart: () => beginRef.current(),
      onEnd: () => endRef.current(),
    })
  }, [supported])

  if (!supported) return null

  return (
    <>
      {/* The prompt/error/bubble are viewport-fixed overlays. They must NOT stay
          inside .player-bar: its backdrop-filter makes it the containing block
          for position:fixed, which would anchor them to the bar instead of the
          viewport. Portal them to <body> so they position against the viewport. */}
      {createPortal(
        <>
          {api.phase === 'holding' && (
            <div className="trial-prompt" role="status">
              你就係楷叔，快滴講尼段古仔吧
            </div>
          )}

          {api.error && (
            <div className="trial-prompt trial-prompt--error" role="alert">
              {api.error}
            </div>
          )}

          {api.bubble && (
            <div className="trial-bubble">
              <div className="trial-bubble__row">
                <button
                  type="button"
                  className="trial-bubble__play"
                  onClick={api.toggleBubble}
                  aria-label={api.bubblePlaying ? '暂停回放' : '回放录音'}
                >
                  <span className="trial-bubble__icon">{api.bubblePlaying ? '❚❚' : '▶'}</span>
                  <span className="trial-bubble__dur">{Math.round(api.bubble.durationSec)}″</span>
                  {api.bubble.uploading && <span className="trial-bubble__up">上傳中…</span>}
                </button>
                {/* Only offered when the server says it can score; hidden otherwise
                    so a visitor never sees a button that must fail. */}
                {api.bubble.assessAvailable && api.bubble.assessment.status !== 'scored' && (
                  <button
                    type="button"
                    className="trial-bubble__assess"
                    onClick={api.assess}
                    disabled={api.bubble.assessment.status === 'loading'}
                  >
                    {api.bubble.assessment.status === 'loading' ? '評分中…' : '評分'}
                  </button>
                )}
              </div>

              {api.bubble.assessment.status === 'scored' && (
                <div className="trial-bubble__result" role="status">
                  <span className="trial-bubble__score">{api.bubble.assessment.score}分</span>
                  <span className="trial-bubble__transcript">{api.bubble.assessment.transcript}</span>
                  {api.bubble.assessment.languageWarning && (
                    <span className="trial-bubble__warn">偵測到非粵語發音，建議用粵語朗讀</span>
                  )}
                </div>
              )}

              {api.bubble.assessment.status === 'failed' && (
                <div className="trial-bubble__result trial-bubble__result--fail" role="alert">
                  {api.bubble.assessment.error}
                </div>
              )}
            </div>
          )}
        </>,
        document.body,
      )}

      <div className="trial-dock">
        <button
          ref={btnRef}
          type="button"
          className={`trial-btn${api.phase === 'holding' ? ' trial-btn--active' : ''}`}
          aria-label="長按錄音"
        >
          <MicIcon />
        </button>
        <span className="trial-caption">當前小節試講和AI評分</span>
        <Link className="trial-privacy" to="/recording-privacy">
          錄音和AI評分隱私處理聲明
        </Link>
      </div>
    </>
  )
}
