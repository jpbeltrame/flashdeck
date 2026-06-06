// src/ui/StudyHome.test.tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { createTextCard } from '../db/cards'
import { startSession } from '../db/sessions'
import StudyHome from './StudyHome'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderHome() {
  return render(<MemoryRouter><StudyHome /></MemoryRouter>)
}

describe('StudyHome', () => {
  it('lists decks with their due counts', async () => {
    await db.decks.add({ id: 'd1', name: 'Biology', createdAt: 0, updatedAt: 0 })
    await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    renderHome()
    expect(await screen.findByText('Biology')).toBeInTheDocument()
    expect(screen.getByText(/1 due/)).toBeInTheDocument()
  })

  it('shows a resume banner when a session is active', async () => {
    await db.decks.add({ id: 'd1', name: 'Biology', createdAt: 0, updatedAt: 0 })
    await createTextCard({ deckId: 'd1', front: 'Q', back: 'A' })
    await startSession('d1', { length: 10, newRatio: 0.6 })
    renderHome()
    expect(await screen.findByText(/resume active session/i)).toBeInTheDocument()
  })
})
