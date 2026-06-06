// src/ui/SessionRunner.test.tsx
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { createTextCard } from '../db/cards'
import { startSession } from '../db/sessions'
import SessionRunner from './SessionRunner'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderRunner(deckId: string) {
  return render(
    <MemoryRouter initialEntries={[`/study?deck=${deckId}`]}>
      <SessionRunner deckId={deckId} />
    </MemoryRouter>,
  )
}

describe('SessionRunner', () => {
  it('starts a session, reveals, rates, and completes', async () => {
    const user = userEvent.setup()
    await createTextCard({ deckId: 'd1', front: 'Capital of France?', back: 'Paris' })
    renderRunner('d1')

    expect(await screen.findByText('Capital of France?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText('Paris')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /good/i }))

    expect(await screen.findByText(/session complete/i)).toBeInTheDocument()
    expect(await db.reviews.count()).toBe(1)
  })

  it('shows nothing-due when the deck has no due cards', async () => {
    await db.decks.add({ id: 'd1', name: 'Empty', createdAt: 0, updatedAt: 0 })
    renderRunner('d1')
    expect(await screen.findByText(/nothing due/i)).toBeInTheDocument()
  })

  it('prompts to resume or discard when another deck has an active session', async () => {
    await db.decks.add({ id: 'd2', name: 'Other Deck', createdAt: 0, updatedAt: 0 })
    await createTextCard({ deckId: 'd2', front: 'Q', back: 'A' })
    await createTextCard({ deckId: 'd1', front: 'Q1', back: 'A1' })
    await startSession('d2', { length: 10, newRatio: 0.6 })

    renderRunner('d1')
    expect(await screen.findByText(/Other Deck/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /discard/i })).toBeInTheDocument()
  })
})
