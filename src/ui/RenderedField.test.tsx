import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../db/db'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import RenderedField from './RenderedField'

beforeAll(() => {
  // jsdom has no object-URL API.
  globalThis.URL.createObjectURL = () => 'blob:mock'
  globalThis.URL.revokeObjectURL = () => {}
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('RenderedField', () => {
  it('renders plain text', async () => {
    render(<RenderedField text="hello world" />)
    expect(await screen.findByText('hello world')).toBeInTheDocument()
  })

  it('renders an image for an image media token', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    render(<RenderedField text={`before ${mediaToken(asset.id)}`} />)
    expect(await screen.findByText('before')).toBeInTheDocument()
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('src', 'blob:mock')
  })
})
