import logoUrl from '../assets/logo.svg'

interface LogoProps {
  className?: string
  size?: number
}

/**
 * Site logo as a baked image asset (web/src/assets/logo.svg): the「三國」
 * glyphs are stored as vector paths, not live text, so rendering never
 * depends on the viewer having the clerical face installed. The standalone
 * web/public/favicon.svg carries the same baked paths.
 */
export default function Logo({ className, size = 40 }: LogoProps) {
  return (
    <img
      className={className}
      src={logoUrl}
      width={size}
      height={size}
      alt="品三國 · 識粵語"
    />
  )
}
