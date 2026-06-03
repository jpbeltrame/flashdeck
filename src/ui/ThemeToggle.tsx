import { useThemeStore } from '../stores/themeStore'

export default function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="rounded-full px-3 py-1 text-sm border border-[var(--color-border)]"
    >
      {theme === 'dark' ? '☾' : '☀'}
    </button>
  )
}
