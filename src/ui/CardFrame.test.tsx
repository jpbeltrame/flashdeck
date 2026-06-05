import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { db } from '../db/db'
import { addMedia } from '../db/media'
import { mediaToken } from '../domain/media'
import CardFrame from './CardFrame'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('CardFrame', () => {
  it('renders a sandboxed iframe whose srcdoc includes the css', async () => {
    render(<CardFrame html="<p>hi</p>" css=".card{color:red}" />)
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('.card{color:red}'))
    expect(frame.getAttribute('srcdoc')).toContain('<p>hi</p>')
  })

  it('inlines referenced media as a data url', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    render(<CardFrame html={`<img src="${mediaToken(asset.id)}">`} />)
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('data:image/png;base64,'))
    expect(frame.getAttribute('srcdoc')).not.toContain('[[media:')
  })
})
