import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useSettingsStore, DEFAULT_SESSION_LENGTH, DEFAULT_NEW_RATIO,
} from './settingsStore'

beforeEach(() => {
  localStorage.clear()
  useSettingsStore.setState({
    sessionLength: DEFAULT_SESSION_LENGTH,
    newRatio: DEFAULT_NEW_RATIO,
  })
})

afterEach(() => {
  vi.resetModules()
})

describe('settingsStore', () => {
  it('defaults sessionLength to 20 and newRatio to 0.6', () => {
    expect(DEFAULT_SESSION_LENGTH).toBe(20)
    expect(DEFAULT_NEW_RATIO).toBe(0.6)
  })

  it('migrates the legacy new-cards-per-day key on init', async () => {
    localStorage.setItem('flashdeck-new-cards-per-day', '8')
    vi.resetModules()
    const fresh = await import('./settingsStore')
    expect(fresh.useSettingsStore.getState().sessionLength).toBe(8)
  })

  it('loads the default sessionLength from empty storage', async () => {
    localStorage.clear()
    vi.resetModules()
    const fresh = await import('./settingsStore')
    expect(fresh.useSettingsStore.getState().sessionLength).toBe(20)
  })

  it('persists and clamps sessionLength to a >=1 integer', () => {
    useSettingsStore.getState().setSessionLength(4.9)
    expect(useSettingsStore.getState().sessionLength).toBe(4)
    useSettingsStore.getState().setSessionLength(0)
    expect(useSettingsStore.getState().sessionLength).toBe(1)
    expect(localStorage.getItem('flashdeck-session-length')).toBe('1')
  })

  it('persists and clamps newRatio to [0,1]', () => {
    useSettingsStore.getState().setNewRatio(1.5)
    expect(useSettingsStore.getState().newRatio).toBe(1)
    useSettingsStore.getState().setNewRatio(-0.2)
    expect(useSettingsStore.getState().newRatio).toBe(0)
    expect(localStorage.getItem('flashdeck-new-ratio')).toBe('0')
  })
})
