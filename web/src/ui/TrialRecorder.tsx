import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { attachLongPress } from '../data/recorder'
import type { TrialRecordApi } from '../data/useTrialRecord'
import { describeTrialError } from '../i18n/errors'
import { useLocale } from '../i18n/locale'

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
  const { t } = useLocale()

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
              {t('trial.holdingPrompt')}
            </div>
          )}

          {api.error && (
            <div className="trial-prompt trial-prompt--error" role="alert">
              {describeTrialError(api.error, t)}
            </div>
          )}

          {api.bubble && (
            <div className="trial-bubble">
              <div className="trial-bubble__row">
                <button
                  type="button"
                  className="trial-bubble__play"
                  onClick={api.toggleBubble}
                  aria-label={api.bubblePlaying ? t('trial.pauseReplay') : t('trial.replay')}
                >
                  <span className="trial-bubble__icon" aria-hidden="true">
                    {api.bubblePlaying ? (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                        <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
                        <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                        <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5z" />
                      </svg>
                    )}
                  </span>
                  <span className="trial-bubble__dur">{Math.round(api.bubble.durationSec)}″</span>
                  {api.bubble.uploading && <span className="trial-bubble__up">{t('trial.uploading')}</span>}
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
                    {api.bubble.assessment.status === 'loading' ? t('trial.assessing') : t('trial.assess')}
                  </button>
                )}
              </div>

              {api.bubble.assessment.status === 'scored' && (
                <div className="trial-bubble__result" role="status">
                  <span className="trial-bubble__score">{t('trial.score', { score: api.bubble.assessment.score! })}</span>
                  <span className="trial-bubble__transcript">{api.bubble.assessment.transcript}</span>
                  {api.bubble.assessment.languageWarning && (
                    <span className="trial-bubble__warn">{t('trial.languageWarning')}</span>
                  )}
                </div>
              )}

              {api.bubble.assessment.status === 'failed' && api.bubble.assessment.reason && (
                <div className="trial-bubble__result trial-bubble__result--fail" role="alert">
                  {describeTrialError(api.bubble.assessment.reason, t)}
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
          aria-label={t('trial.recordButton')}
        >
          <MicIcon />
        </button>
        <span className="trial-caption">{t('trial.caption')}</span>
        <Link className="trial-privacy" to="/recording-privacy">
          {t('trial.privacyLink')}
        </Link>
      </div>
    </>
  )
}
