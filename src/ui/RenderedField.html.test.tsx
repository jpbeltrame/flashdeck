import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../db/db'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import RenderedField from './RenderedField'

beforeAll(() => {
  globalThis.URL.createObjectURL = () => 'blob:mock'
  globalThis.URL.revokeObjectURL = () => {}
})

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('RenderedField (html format)', () => {
  it('renders sanitized HTML and strips scripts', async () => {
    render(<RenderedField text={'<b>bold</b><script>alert(1)</script>'} format="html" />)
    expect(await screen.findByText('bold')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it('resolves an image media token in an img src', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    render(<RenderedField text={`<img src="${mediaToken(asset.id)}">`} format="html" />)
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('src', 'blob:mock')
  })

  it('still renders plain text when format is text', async () => {
    render(<RenderedField text="just text" />)
    expect(await screen.findByText('just text')).toBeInTheDocument()
  })
})
