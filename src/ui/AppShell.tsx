import { NavLink, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

const tabs = [
  { to: '/', label: 'Decks', end: true },
  { to: '/study', label: 'Study', end: false },
  { to: '/stats', label: 'Progress', end: false },
  { to: '/settings', label: 'Settings', end: false },
]

export default function AppShell() {
  return (
    <div className="flex flex-col h-full max-w-screen-sm mx-auto">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="font-semibold">FlashDeck</span>
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <Outlet />
      </main>

      <nav className="flex border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex-1 text-center py-3 text-sm ${
                isActive ? 'text-[var(--color-accent)] font-medium' : 'text-[var(--color-muted)]'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
