import { Route, Routes } from 'react-router-dom'
import { useLocale } from './i18n/locale'
import Layout from './ui/Layout'
import HomePage from './ui/HomePage'
import EpisodePage from './ui/EpisodePage'
import AboutPage from './ui/AboutPage'
import RecordingPrivacyPage from './ui/RecordingPrivacyPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="episode/:episode" element={<EpisodePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="recording-privacy" element={<RecordingPrivacyPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function NotFound() {
  const { t } = useLocale()
  return (
    <div className="page center">
      <h2>{t('notFound.title')}</h2>
      <p>{t('notFound.body')}</p>
    </div>
  )
}
