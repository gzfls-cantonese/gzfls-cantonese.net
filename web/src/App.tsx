import { Route, Routes } from 'react-router-dom'
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
  return (
    <div className="page center">
      <h2>頁面不存在</h2>
      <p>返回首頁繼續聽評書。</p>
    </div>
  )
}
