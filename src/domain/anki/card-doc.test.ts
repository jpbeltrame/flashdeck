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

  it('resolves an image media token to its data url (in an img src)', () => {
    const doc = buildCardDoc({
      html: '<img src="[[media:m1]]">',
      media: { m1: { url: 'data:image/png;base64,AAAA', kind: 'image' } },
    })
    expect(doc).toContain('<img src="data:image/png;base64,AAAA">')
    expect(doc).not.toContain('[[media:m1]]')
  })

  it('renders a standalone audio token as an <audio> element', () => {
    const doc = buildCardDoc({
      html: 'listen [[media:a1]]',
      media: { a1: { url: 'data:audio/mpeg;base64,BBBB', kind: 'audio' } },
    })
    expect(doc).toContain('<audio controls src="data:audio/mpeg;base64,BBBB"></audio>')
  })
})
