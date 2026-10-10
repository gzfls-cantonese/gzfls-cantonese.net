import logoUrl from '../assets/logo.svg'
import { useLocale } from '../i18n/locale'

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
  // The mark spells the site title, so its accessible name is the localized
  // title rather than a separate string that could drift from it.
  const { t } = useLocale()
  return (
    <img
      className={className}
      src={logoUrl}
      width={size}
      height={size}
      alt={t('doc.title')}
    />
  )
}
