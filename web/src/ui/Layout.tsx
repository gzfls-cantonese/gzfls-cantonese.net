import { Link, Outlet, useLocation } from 'react-router-dom'
import Logo from './Logo'

export default function Layout() {
  // The home page renders its own source footer inside the three-part layout.
  const isHome = useLocation().pathname === '/'

  return (
    <div className={`app-shell${isHome ? ' app-shell--home' : ''}`}>
      <header className="app-header">
        <Link to="/" className="brand">
          <Logo className="brand-logo" size={40} />
          <span className="brand-text">粵語評書</span>
        </Link>
        <nav className="nav">
          <Link to="/">選集</Link>
          <Link to="/about">關於</Link>
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      {!isHome && (
        <footer className="app-footer">
          <p>
            語料來源：Hugging Face · CanCLID <code>zoengjyutgaai</code>《三國演義》粵語評書
          </p>
          <p>
            授權：
            <a
              href="https://creativecommons.org/publicdomain/zero/1.0/"
              target="_blank"
              rel="noreferrer noopener"
            >
              CC0 1.0 Universal（公共領域貢獻）
            </a>
          </p>
        </footer>
      )}
    </div>
  )
}
