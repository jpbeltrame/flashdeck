import { create } from 'zustand'

type Theme = 'light' | 'dark'
const KEY = 'flashdeck-theme'

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeState {
  theme: Theme
  setTheme: (t: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme(),
  setTheme: (theme) => {
    localStorage.setItem(KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

// Apply on module load so the first paint matches the stored theme.
applyTheme(useThemeStore.getState().theme)
