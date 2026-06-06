import { useSearchParams } from 'react-router-dom'
import StudyHome from '../ui/StudyHome'
import SessionRunner from '../ui/SessionRunner'

export default function StudyPage() {
  const [params] = useSearchParams()
  const deck = params.get('deck')
  return deck ? <SessionRunner deckId={deck} /> : <StudyHome />
}
