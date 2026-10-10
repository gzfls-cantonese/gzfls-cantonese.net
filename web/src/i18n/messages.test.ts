import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, LOCALES, MESSAGES, type Messages } from './messages'

/**
 * The type system already rejects a missing key (see `Record<Locale, Messages>`),
 * but it happily accepts `''`. This walks both dictionaries at runtime so a blank
 * placeholder cannot ship — the spec forbids an empty value where the other locale
 * shows text.
 */
describe('message dictionary', () => {
  it('declares every supported locale exactly once', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...LOCALES].sort())
    expect(LOCALES).toContain(DEFAULT_LOCALE)
  })

  it('has identical key sets across locales', () => {
    const reference = Object.keys(MESSAGES[DEFAULT_LOCALE]).sort()
    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(reference)
    }
  })

  it('has no blank or non-renderable value in any locale', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale]) as [keyof Messages, unknown][]) {
        if (typeof value === 'string') {
          expect(value.trim(), `${locale}:${String(key)} is blank`).not.toBe('')
        } else {
          expect(typeof value, `${locale}:${String(key)} is not a string or function`).toBe('function')
        }
      }
    }
  })
})
