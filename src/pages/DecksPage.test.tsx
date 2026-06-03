import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
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
  it('creates a deck and shows it in the list', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByPlaceholderText(/new deck name/i), 'Biology')
    await user.click(screen.getByRole('button', { name: /add deck/i }))
    expect(await screen.findByText('Biology')).toBeInTheDocument()
  })

  it('shows the empty state when there are no decks', async () => {
    renderPage()
    expect(await screen.findByText(/no decks yet/i)).toBeInTheDocument()
  })
})
