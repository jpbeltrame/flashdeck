import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { createDeck } from '../db/decks'
import DecksPage from './DecksPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <DecksPage />
    </MemoryRouter>,
  )
}

describe('DecksPage', () => {
  it('lists existing decks', async () => {
    await createDeck('Biology')
    renderPage()
    expect(await screen.findByText('Biology')).toBeInTheDocument()
  })

  it('links to the create-deck page', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: /new deck/i })
    expect(link).toHaveAttribute('href', '/new')
  })

  it('shows the empty state when there are no decks', async () => {
    renderPage()
    expect(await screen.findByText(/no decks yet/i)).toBeInTheDocument()
  })
})
