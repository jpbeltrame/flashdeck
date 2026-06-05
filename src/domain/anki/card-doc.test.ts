import { describe, expect, it } from 'vitest'
import { buildCardDoc } from './card-doc'

describe('buildCardDoc', () => {
  it('embeds the css and the body inside a .card wrapper', () => {
    const doc = buildCardDoc({ html: '<p>hi</p>', css: '.card{color:red}' })
    expect(doc).toContain('<style>.card{color:red}</style>')
    expect(doc).toContain('<p>hi</p>')
    expect(doc).toContain('class="card"')
    expect(doc).toContain('flashdeck-card-height')
  })

  it('adds the nightMode class in dark mode', () => {
    expect(buildCardDoc({ html: 'x', dark: true })).toContain('nightMode')
  })

  it('sets a device-width viewport so cards lay out at the iframe width', () => {
    const doc = buildCardDoc({ html: 'x' })
    expect(doc).toContain('name="viewport"')
    expect(doc).toContain('width=device-width')
  })

  it('resets default margins and wraps overflowing content', () => {
    const doc = buildCardDoc({ html: 'x' })
    // Base reset runs before the deck CSS so it does not override the note type.
    const baseIdx = doc.indexOf('margin:0')
    const deckIdx = doc.indexOf('.card{color:red}')
    expect(baseIdx).toBeGreaterThanOrEqual(0)
    expect(doc).toContain('box-sizing:border-box')
    expect(doc).toContain('overflow-wrap:break-word')
    // media should not blow out the layout width
    expect(doc).toContain('max-width:100%')
    if (deckIdx >= 0) expect(baseIdx).toBeLessThan(deckIdx)
  })

  it('puts the base reset before the deck css', () => {
    const doc = buildCardDoc({ html: 'x', css: '.card{color:red}' })
    expect(doc.indexOf('margin:0')).toBeLessThan(doc.indexOf('.card{color:red}'))
  })

  it('resolves an image media token to its data url (in an img src)', () => {
    const doc = buildCardDoc({
      html: '<img src="[[media:m1]]">',
      media: { m1: { url: 'data:image/png;base64,AAAA', kind: 'image' } },
    })
    expect(doc).toContain('<img src="data:image/png;base64,AAAA">')
    expect(doc).not.toContain('[[media:m1]]')
  })

  it('defines a Persistence polyfill before the card body so MCQ JS never crashes', () => {
    const doc = buildCardDoc({ html: '<div id="opts"></div>' })
    // The crash was: Persistence.setItem is not a function.
    expect(doc).toContain('Persistence')
    expect(doc).toContain('setItem')
    expect(doc).toContain('getItem')
    expect(doc).toContain('isAvailable')
    // Polyfill must be installed before any deck script in the body runs.
    expect(doc.indexOf('Persistence')).toBeLessThan(doc.indexOf('id="opts"'))
  })

  it('seeds Persistence from the supplied store (carries MCQ state front→back)', () => {
    const doc = buildCardDoc({ html: 'x', persistence: { shuffle: '[2,0,1]' } })
    expect(doc).toContain('shuffle')
    expect(doc).toContain('[2,0,1]')
  })

  it('relays Persistence writes to the parent so the next side can read them', () => {
    expect(buildCardDoc({ html: 'x' })).toContain('flashdeck-persistence')
  })

  it('bundles jQuery before the card body so templates using $ never crash', () => {
    const doc = buildCardDoc({ html: '<div id="opts"></div>' })
    // Anki/AnkiDroid provide jQuery; faithful templates assume `$` exists.
    expect(doc).toContain('jQuery v')
    // jQuery must load before any deck script in the body references `$`.
    expect(doc.indexOf('jQuery v')).toBeLessThan(doc.indexOf('id="opts"'))
  })

  it('renders a standalone audio token as an <audio> element', () => {
    const doc = buildCardDoc({
      html: 'listen [[media:a1]]',
      media: { a1: { url: 'data:audio/mpeg;base64,BBBB', kind: 'audio' } },
    })
    expect(doc).toContain('<audio controls src="data:audio/mpeg;base64,BBBB"></audio>')
  })
})
