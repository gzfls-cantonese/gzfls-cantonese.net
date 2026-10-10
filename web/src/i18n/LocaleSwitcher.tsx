import { useEffect, useRef, useState } from 'react'
import { LOCALES, type Locale, type StringKey } from './messages'
import { useLocale } from './locale'

const LABEL_KEY: Record<Locale, StringKey> = {
  'zh-Hant': 'locale.name.zh-Hant',
  en: 'locale.name.en',
}

const ABBR_KEY: Record<Locale, StringKey> = {
  'zh-Hant': 'locale.abbr.zh-Hant',
  en: 'locale.abbr.en',
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17" />
      <path d="M12 3c2.6 2.6 2.6 15.4 0 18M12 3c-2.6 2.6-2.6 15.4 0 18" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="11"
      height="11"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  )
}

/**
 * Globe + the active locale's abbreviation + chevron, disclosing the two locales
 * by their native names, so a visitor who cannot read the current locale can
 * still recognise their own. The abbreviation is what makes the control legible
 * as a language switch at a glance; the full native names live in the panel.
 * A compact trigger rather than a side-by-side pill of both names because the
 * pill did not fit below 390px once the nav labels were English — see design
 * decision 8.
 *
 * A disclosure rather than a `role="menu"`: the options are plain buttons reachable
 * by Tab, so no arrow-key contract is implied.
 */
export default function LocaleSwitcher() {
  const { locale, setLocale, t } = useLocale()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="locale-switch" ref={rootRef}>
      <button
        type="button"
        className="locale-switch__btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t('locale.switcher.label')}: ${t(LABEL_KEY[locale])}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <GlobeIcon />
        <span className="locale-switch__abbr">{t(ABBR_KEY[locale])}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div className="locale-switch__menu">
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              className="locale-switch__opt"
              aria-current={option === locale ? 'true' : undefined}
              onClick={() => {
                setLocale(option)
                setOpen(false)
              }}
            >
              {t(LABEL_KEY[option])}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
