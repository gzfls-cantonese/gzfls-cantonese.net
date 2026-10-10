import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_LOCALE,
  MESSAGES,
  isLocale,
  type Locale,
  type Messages,
  type Translator,
} from './messages'

/**
 * Namespaced like the existing `sanguo.recordings.anonId` key. Note that
 * localStorage is per origin and per browser profile: production is reachable
 * over both http and https with no redirect, so those two origins hold separate
 * copies of this preference.
 */
const STORAGE_KEY = 'sanguo.locale'

export interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translator
}

function makeTranslator(messages: Messages): Translator {
  const translate = (key: keyof Messages, args?: unknown): string => {
    // Widened through a cast because `Messages[keyof Messages]` collapses to
    // `string` while no key takes arguments, which would narrow this branch to
    // `never` and break the first interpolated message added later.
    const value = messages[key] as string | ((args: unknown) => string)
    return typeof value === 'function' ? value(args) : value
  }
  return translate as unknown as Translator
}

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    // Safari private mode and blocked storage throw on access; fall back to the
    // default rather than failing to render.
    return DEFAULT_LOCALE
  }
}

function writeStoredLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // The choice still applies for this session; it just will not persist.
  }
}

/**
 * The context defaults to the `zh-Hant` dictionary rather than `null`, so a
 * component rendered without a provider behaves exactly as the app did before
 * localization. That keeps existing tests working unwrapped and removes a
 * null-check from every consumer. The trade-off — a forgotten provider failing
 * silently as Chinese — is guarded by an `App`-level integration test.
 */
const FALLBACK: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: makeTranslator(MESSAGES[DEFAULT_LOCALE]),
}

const LocaleContext = createContext<LocaleContextValue>(FALLBACK)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale)

  const setLocale = useCallback((next: Locale) => {
    writeStoredLocale(next)
    setLocaleState(next)
  }, [])

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: makeTranslator(MESSAGES[locale]) }),
    [locale, setLocale],
  )

  // useLayoutEffect rather than useEffect so a returning visitor's lang and tab
  // title are correct before the browser paints. index.html keeps its static
  // zh-Hant defaults for a first visit.
  useLayoutEffect(() => {
    document.documentElement.lang = locale
    document.title = value.t('doc.title')
  }, [locale, value])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext)
}

export function useT(): Translator {
  return useContext(LocaleContext).t
}
