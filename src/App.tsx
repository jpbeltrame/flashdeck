import { Routes, Route } from 'react-router-dom'
import AppShell from './ui/AppShell'
import DecksPage from './pages/DecksPage'
import DeckDetailPage from './pages/DeckDetailPage'
import StudyPage from './pages/StudyPage'
import StatsPage from './pages/StatsPage'
import SchedulePage from './pages/SchedulePage'
import ImportPage from './pages/ImportPage'
import ExportPage from './pages/ExportPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DecksPage />} />
        <Route path="deck/:id" element={<DeckDetailPage />} />
        <Route path="study" element={<StudyPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="schedule" element={<SchedulePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="export" element={<ExportPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
