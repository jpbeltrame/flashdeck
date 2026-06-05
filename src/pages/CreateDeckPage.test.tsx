import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { db } from '../db/db'
import CreateDeckPage from './CreateDeckPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/new']}>
      <Routes>
        <Route path="/new" element={<CreateDeckPage />} />
        <Route path="/deck/:id" element={<div>deck detail</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CreateDeckPage', () => {
  it('creates a deck from name + description and navigates to its detail page', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/name/i), 'Biology')
    await user.type(screen.getByLabelText(/description/i), 'Cell stuff')
    await user.click(screen.getByRole('button', { name: /create deck/i }))

    expect(await screen.findByText('deck detail')).toBeInTheDocument()
    const decks = await db.decks.toArray()
    expect(decks).toHaveLength(1)
    expect(decks[0]).toMatchObject({ name: 'Biology', description: 'Cell stuff' })
  })

  it('disables the create button until a name is entered', async () => {
    const user = userEvent.setup()
    renderPage()

    const button = screen.getByRole('button', { name: /create deck/i })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/name/i), 'Chemistry')
    expect(button).toBeEnabled()
  })

  it('offers an .apkg import control', () => {
    renderPage()
    expect(screen.getByLabelText(/choose .apkg/i)).toBeInTheDocument()
  })
})
