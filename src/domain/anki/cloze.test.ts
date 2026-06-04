import { describe, expect, it } from 'vitest'
import { clozeOrdinals, renderCloze } from './cloze'

describe('clozeOrdinals', () => {
  it('lists unique 0-based ordinals present', () => {
    expect(clozeOrdinals('{{c1::a}} and {{c3::b}} and {{c1::c}}')).toEqual([0, 2])
  })
  it('returns empty when there are no clozes', () => {
    expect(clozeOrdinals('plain text')).toEqual([])
  })
})

describe('renderCloze', () => {
  const text = 'The {{c1::sky}} is {{c2::blue::color}}.'

  it('hides the active deletion on the front and reveals others', () => {
    expect(renderCloze(text, 0, 'front')).toBe(
      'The <span class="cloze">[...]</span> is blue.',
    )
  })
  it('uses the hint when present on the front', () => {
    expect(renderCloze(text, 1, 'front')).toBe(
      'The sky is <span class="cloze">[color]</span>.',
    )
  })
  it('reveals the active deletion on the back', () => {
    expect(renderCloze(text, 0, 'back')).toBe(
      'The <span class="cloze">sky</span> is blue.',
    )
  })
})
