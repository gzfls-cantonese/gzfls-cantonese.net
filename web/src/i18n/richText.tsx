import type { ReactNode } from 'react'

/**
 * Renders a dictionary value that carries `**emphasis**` markers. The privacy
 * statement emphasizes a dozen inline spans; expressing each as three
 * before/emphasis/after keys would shred every sentence and make the two locales
 * impossible to compare, so the emphasis travels inside the string instead.
 *
 * Deliberately minimal: only `**…**` is recognized, there is no nesting and no
 * escaping. An unclosed marker does not match the pattern and renders literally,
 * so a typo shows up on screen rather than swallowing the rest of the sentence.
 */
export function richText(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    // split() with a capture group alternates plain text and captured emphasis.
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
  )
}
