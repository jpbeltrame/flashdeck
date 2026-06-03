import { beforeEach, describe, expect, it } from 'vitest'
import { useThemeStore } from './themeStore'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  useThemeStore.setState({ theme: 'light' })
})

describe('themeStore', () => {
  it('toggles between light and dark', () => {
    useThemeStore.getState().setTheme('dark')
    expect(useThemeStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('persists the theme to localStorage', () => {
    useThemeStore.getState().setTheme('dark')
    expect(localStorage.getItem('flashdeck-theme')).toBe('dark')
  })
})
