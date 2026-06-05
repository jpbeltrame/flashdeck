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

  it('seeds the next side with Persistence values written by the previous side', async () => {
    const { rerender } = render(<CardFrame html="<div>front</div>" seedKey="card1" />)
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('front'))

    // The question side wrote a shuffled option order via Persistence.
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow as Window,
      data: { type: 'flashdeck-persistence', store: { order: '[2,0,1]' } },
    }))

    // Reveal the answer side of the SAME card.
    rerender(<CardFrame html="<div>back</div>" seedKey="card1" />)
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('back'))
    expect(frame.getAttribute('srcdoc')).toContain('[2,0,1]')
  })

  it('clears Persistence when a different card is shown', async () => {
    const { rerender } = render(<CardFrame html="<div>front</div>" seedKey="card1" />)
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('front'))
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow as Window,
      data: { type: 'flashdeck-persistence', store: { order: '[2,0,1]' } },
    }))

    rerender(<CardFrame html="<div>next</div>" seedKey="card2" />)
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('next'))
    expect(frame.getAttribute('srcdoc')).not.toContain('[2,0,1]')
  })

  it('inlines referenced media as a data url', async () => {
    const asset = await addMedia(new Blob(['x'], { type: 'image/png' }), 'p.png', 'image/png')
    render(<CardFrame html={`<img src="${mediaToken(asset.id)}">`} />)
    const frame = await screen.findByTitle('card') as HTMLIFrameElement
    await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('data:image/png;base64,'))
    expect(frame.getAttribute('srcdoc')).not.toContain('[[media:')
  })
})
