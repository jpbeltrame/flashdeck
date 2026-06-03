import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { createTextCard } from '../db/cards'
import StudyPage from './StudyPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

function renderStudy() {
  return render(
    <MemoryRouter initialEntries={['/study']}>
      <StudyPage />
    </MemoryRouter>,
  )
}

describe('StudyPage', () => {
  it('reveals the answer then accepts a rating and advances to done', async () => {
    const user = userEvent.setup()
    await createTextCard({ deckId: 'd1', front: 'Capital of France?', back: 'Paris' })
    renderStudy()

    expect(await screen.findByText('Capital of France?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /show answer/i }))
    expect(screen.getByText('Paris')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /good/i }))

    expect(await screen.findByText(/all done/i)).toBeInTheDocument()
    expect(await db.reviews.count()).toBe(1)
  })

  it('shows the all-caught-up state when nothing is due', async () => {
    renderStudy()
    expect(await screen.findByText(/nothing due/i)).toBeInTheDocument()
  })
})
