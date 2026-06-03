import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../db/db'
import CardEditor from './CardEditor'

beforeAll(() => {
  globalThis.URL.createObjectURL = () => 'blob:mock'
  globalThis.URL.revokeObjectURL = () => {}
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('CardEditor media attach', () => {
  it('attaches an image to the front and submits a token in the field', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<CardEditor submitLabel="Save card" onSubmit={onSubmit} />)

    const file = new File(['x'], 'pic.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText(/attach to front/i), file)

    // The front field now contains a media token.
    const front = screen.getByLabelText('Front') as HTMLTextAreaElement
    expect(front.value).toMatch(/\[\[media:.+\]\]/)
    expect(await db.media.count()).toBe(1)

    await user.type(screen.getByLabelText('Back'), 'Answer')
    await user.click(screen.getByRole('button', { name: /save card/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [front2] = onSubmit.mock.calls[0]
    expect(front2).toMatch(/\[\[media:.+\]\]/)
  })
})
