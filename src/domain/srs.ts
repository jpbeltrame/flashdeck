import type { Card } from '../db/schema'

export type Rating = 1 | 2 | 3 | 4
export const DAY_MS = 86_400_000
const MIN_EASE = 1.3

type Srs = Card['srs']

// Map the 4 buttons onto the SM-2 quality scale (0–5); q < 3 is a lapse.
const QUALITY: Record<Rating, number> = { 1: 2, 2: 3, 3: 4, 4: 5 }

export function newCardSrs(): Srs {
  return { status: 'new', ease: 2.5, intervalDays: 0, dueDate: 0, reps: 0, lapses: 0 }
}

export function reviewCard(srs: Srs, rating: Rating, now: number = Date.now()): Srs {
  const q = QUALITY[rating]
  const easeDelta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
  const ease = Math.max(MIN_EASE, srs.ease + easeDelta)

  // Lapse: drop into relearning, 1-day step.
  if (q < 3) {
    return {
      status: 'relearning',
      ease,
      intervalDays: 1,
      dueDate: now + DAY_MS,
      reps: 0,
      lapses: srs.lapses + 1,
    }
  }

  let intervalDays: number
  if (srs.reps === 0) {
    intervalDays = rating === 4 ? 4 : 1
  } else if (srs.reps === 1) {
    intervalDays = rating === 2 ? 4 : 6
  } else if (rating === 2) {
    intervalDays = Math.round(srs.intervalDays * 1.2)
  } else {
    intervalDays = Math.round(srs.intervalDays * ease)
    if (rating === 4) intervalDays = Math.round(intervalDays * 1.3)
  }
  intervalDays = Math.max(1, intervalDays)

  return {
    status: 'review',
    ease,
    intervalDays,
    dueDate: now + intervalDays * DAY_MS,
    reps: srs.reps + 1,
    lapses: srs.lapses,
  }
}
