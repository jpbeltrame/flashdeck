import { create } from 'zustand'

export const DEFAULT_SESSION_LENGTH = 20
export const DEFAULT_NEW_RATIO = 0.6

const LENGTH_KEY = 'flashdeck-session-length'
const LEGACY_LENGTH_KEY = 'flashdeck-new-cards-per-day'
const RATIO_KEY = 'flashdeck-new-ratio'

function initialSessionLength(): number {
  const raw = localStorage.getItem(LENGTH_KEY) ?? localStorage.getItem(LEGACY_LENGTH_KEY)
  if (raw === null) return DEFAULT_SESSION_LENGTH
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_SESSION_LENGTH
}

function initialNewRatio(): number {
  const raw = localStorage.getItem(RATIO_KEY)
  if (raw === null) return DEFAULT_NEW_RATIO
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_NEW_RATIO
}

interface SettingsState {
  /** How many cards a study session serves up. */
  sessionLength: number
  /** Target fraction of new cards per session, 0..1. */
  newRatio: number
  setSessionLength: (n: number) => void
  setNewRatio: (r: number) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  sessionLength: initialSessionLength(),
  newRatio: initialNewRatio(),
  setSessionLength: (n) => {
    const clamped = Math.max(1, Math.floor(Number.isFinite(n) ? n : DEFAULT_SESSION_LENGTH))
    localStorage.setItem(LENGTH_KEY, String(clamped))
    set({ sessionLength: clamped })
  },
  setNewRatio: (r) => {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(r) ? r : DEFAULT_NEW_RATIO))
    localStorage.setItem(RATIO_KEY, String(clamped))
    set({ newRatio: clamped })
  },
}))
