import { Link, Outlet, useLocation } from 'react-router-dom'
import Logo from './Logo'
import LocaleSwitcher from '../i18n/LocaleSwitcher'
import { useLocale } from '../i18n/locale'

export default function Layout() {
  // The home page renders its own source footer inside the three-part layout.
  const isHome = useLocation().pathname === '/'
  const { t } = useLocale()

  return (
    <div className={`app-shell${isHome ? ' app-shell--home' : ''}`}>
      <header className="app-header">
        <Link to="/" className="brand">
          <Logo className="brand-logo" size={40} />
          <span className="brand-text">{t('brand.text')}</span>
        </Link>
        <nav className="nav">
          <Link to="/">{t('nav.episodes')}</Link>
          <Link to="/about">{t('nav.about')}</Link>
          <LocaleSwitcher />
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      {!isHome && (
        <footer className="app-footer">
          <div className="home__source">
            <span>
              {t('source.datasetLabel')}Hugging Face · <code>CanCLID/zoengjyutgaai</code>
            </span>
            <span>
              {t('source.licenseLabel')}
              <a
                href="https://creativecommons.org/publicdomain/zero/1.0/"
                target="_blank"
                rel="noreferrer noopener"
              >
                CC0 1.0 Universal
              </a>
            </span>
          </div>
        </footer>
      )}
    </div>
  )
}
