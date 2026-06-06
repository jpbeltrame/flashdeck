// src/ui/ActivityHeatmap.test.tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ActivityDay } from '../domain/activity'
import ActivityHeatmap from './ActivityHeatmap'

function days(n: number): ActivityDay[] {
  const base = new Date(2026, 0, 1).getTime()
  return Array.from({ length: n }, (_, i) => ({
    date: base + i * 86_400_000,
    cards: i,
    sessions: i % 2,
  }))
}

describe('ActivityHeatmap', () => {
  it('renders a cell per day with a count tooltip', () => {
    render(<ActivityHeatmap days={days(7)} />)
    // Each day cell exposes its counts via title.
    expect(screen.getAllByTitle(/cards/).length).toBe(7)
  })

  it('exposes Cards / Sessions / Both metric filters', async () => {
    const user = userEvent.setup()
    render(<ActivityHeatmap days={days(7)} />)
    expect(screen.getByRole('button', { name: /^cards$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^sessions$/i })).toBeInTheDocument()
    const both = screen.getByRole('button', { name: /^both$/i })
    await user.click(both)
    expect(both).toHaveAttribute('aria-pressed', 'true')
  })
})
