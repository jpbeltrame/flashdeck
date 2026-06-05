import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { db } from '../db/db'
import { createTextCard } from '../db/cards'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import StudyPage from './StudyPage'

beforeAll(() => {
  globalThis.URL.createObjectURL = () => 'blob:mock'
  globalThis.URL.revokeObjectURL = () => {}
})

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

  it('renders an image on the front of a media card', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    await createTextCard({ deckId: 'd1', front: mediaToken(asset.id), back: 'Paris' })
    renderStudy()
    expect(await screen.findByRole('img')).toHaveAttribute('src', 'blob:mock')
  })

  it('renders an imported html note inside a sandboxed iframe', async () => {
    const noteId = crypto.randomUUID()
    await db.notes.add({
      id: noteId, deckId: 'd1', type: 'basic', format: 'html',
      css: '.card{color:#333}', fields: { Front: '<b>Q</b>', Back: '<b>Q</b><hr>A' }, mediaRefs: [],
    })
    await db.cards.add({
      id: crypto.randomUUID(), noteId, deckId: 'd1', templateIndex: 0,
      srs: { status: 'new', ease: 2.5, intervalDays: 0, dueDate: 0, reps: 0, lapses: 0 },
    })
    renderStudy()
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
  })
})
