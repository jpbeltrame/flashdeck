import type { ComponentType, SVGProps } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import ThemeToggle from './ThemeToggle'

type IconProps = SVGProps<SVGSVGElement>

function DecksIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M7 20h10M9 17v3M15 17v3" />
    </svg>
  )
}

function StudyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2V5Z" />
      <path d="M20 5a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2V5Z" />
    </svg>
  )
}

function ProgressIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 21V10M12 21V4M19 21v-7" />
    </svg>
  )
}

function SettingsIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

const tabs: { to: string; label: string; end: boolean; Icon: ComponentType<IconProps> }[] = [
  { to: '/', label: 'Decks', end: true, Icon: DecksIcon },
  { to: '/study', label: 'Study', end: false, Icon: StudyIcon },
  { to: '/stats', label: 'Progress', end: false, Icon: ProgressIcon },
  { to: '/settings', label: 'Settings', end: false, Icon: SettingsIcon },
]

export default function AppShell() {
  return (
    <div className="flex flex-col h-full max-w-screen-sm mx-auto">
      {/* Top inset clears the translucent iOS status bar in standalone PWA
          mode (black-translucent + viewport-fit=cover), mirroring the nav's
          bottom inset; falls back to the normal 0.75rem padding in-browser. */}
      <header className="flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-[var(--color-border)]">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-6 w-6" />
          FlashDeck
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <Outlet />
      </main>

      {/* Floating pill nav: lifted clear of the iOS home-indicator gesture
          zone. The pill floats, so it needs only part of the safe-area inset
          as clearance — subtract some back out to avoid an oversized gap. */}
      <nav className="px-4 pt-2 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.9rem))]">
        <div className="mx-auto flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-lg shadow-black/5">
          {tabs.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-full py-2 text-xs transition-colors ${
                  isActive
                    ? 'bg-[var(--color-accent)]/12 text-[var(--color-accent)] font-medium'
                    : 'text-[var(--color-muted)]'
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
