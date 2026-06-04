import { describe, expect, it } from 'vitest'
import { splitFields, rewriteMedia, renderCard } from './fields'
import { mediaToken } from '../media'
import type { AnkiModel } from './types'

describe('splitFields', () => {
  it('zips 0x1f-separated values to model field names', () => {
    expect(splitFields('Q\x1fA', ['Front', 'Back'])).toEqual({ Front: 'Q', Back: 'A' })
  })
})

describe('rewriteMedia', () => {
  const map = new Map([['cat.jpg', 'ID1'], ['meow.mp3', 'ID2']])
  it('rewrites img src (double and single quotes)', () => {
    expect(rewriteMedia('<img src="cat.jpg">', map)).toBe(`<img src="${mediaToken('ID1')}">`)
    expect(rewriteMedia("<img src='cat.jpg'>", map)).toBe(`<img src="${mediaToken('ID1')}">`)
  })
  it('rewrites [sound:f] to a standalone token', () => {
    expect(rewriteMedia('hear [sound:meow.mp3]', map)).toBe(`hear ${mediaToken('ID2')}`)
  })
  it('leaves unknown refs untouched', () => {
    expect(rewriteMedia('<img src="gone.jpg">', map)).toBe('<img src="gone.jpg">')
  })
})

const basic: AnkiModel = {
  id: '1', name: 'Basic', type: 0,
  flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
  tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr>{{Back}}' }],
}
const cloze: AnkiModel = {
  id: '2', name: 'Cloze', type: 1,
  flds: [{ name: 'Text', ord: 0 }],
  tmpls: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}' }],
}

describe('renderCard', () => {
  const map = new Map<string, string>()
  it('renders a Basic card front/back via the template', () => {
    const { front, back, warnings } = renderCard(basic, { Front: 'Q', Back: 'A' }, 0, map)
    expect(front).toBe('Q')
    expect(back).toBe('Q<hr>A')
    expect(warnings).toEqual([])
  })
  it('renders a Cloze card for the given ordinal', () => {
    const { front, back } = renderCard(cloze, { Text: 'The {{c1::sky}} is {{c2::blue}}' }, 0, map)
    expect(front).toBe('The <span class="cloze">[...]</span> is blue')
    expect(back).toBe('The <span class="cloze">sky</span> is blue')
  })
  it('warns about card-side script', () => {
    const m: AnkiModel = { ...basic, tmpls: [{ name: 'x', ord: 0, qfmt: '<script>x()</script>{{Front}}', afmt: '{{Back}}' }] }
    const { warnings } = renderCard(m, { Front: 'Q', Back: 'A' }, 0, map)
    expect(warnings.some((w) => /script/i.test(w))).toBe(true)
  })
})
