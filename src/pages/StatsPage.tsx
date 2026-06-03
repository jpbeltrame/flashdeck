import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { reviewsToday, studyStreak } from '../db/stats'
import { countDue } from '../db/study'
import Card from '../ui/Card'

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-[var(--color-muted)] mt-1">{label}</div>
    </Card>
  )
}

export default function StatsPage() {
  const data = useLiveQuery(async () => {
    const now = Date.now()
    return {
      today: await reviewsToday(now),
      streak: await studyStreak(now),
      total: await db.cards.count(),
      due: await countDue('all', now),
    }
  }, [])

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Progress</h1>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Reviewed today" value={data?.today ?? 0} />
        <Stat label="Day streak" value={data?.streak ?? 0} />
        <Stat label="Cards due" value={data?.due ?? 0} />
        <Stat label="Total cards" value={data?.total ?? 0} />
      </div>
    </section>
  )
}
