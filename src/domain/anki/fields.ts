import { mediaToken } from '../media'
import { renderCloze } from './cloze'
import type { AnkiModel } from './types'

/** Anki separates field values with the unit-separator control char (U+001F). */
const FIELD_SEP = '\x1f'

export function splitFields(flds: string, fieldNames: string[]): Record<string, string> {
  const values = flds.split(FIELD_SEP)
  const out: Record<string, string> = {}
  fieldNames.forEach((name, i) => { out[name] = values[i] ?? '' })
  return out
}

/** Rewrite Anki media references to our [[media:<id>]] tokens using filename→id. */
export function rewriteMedia(html: string, idByFilename: Map<string, string>): string {
  // <img src="file"> / <img src='file'>
  let out = html.replace(/<img\b[^>]*?\bsrc=(["'])(.*?)\1[^>]*>/gi, (full, _q, file: string) => {
    const id = idByFilename.get(file)
    return id ? `<img src="${mediaToken(id)}">` : full
  })
  // [sound:file]
  out = out.replace(/\[sound:(.*?)\]/gi, (full, file: string) => {
    const id = idByFilename.get(file)
    return id ? mediaToken(id) : full
  })
  return out
}

function stripSections(template: string): string {
  // Best-effort: drop Anki conditional markers, keep their inner content.
  return template.replace(/\{\{[#^/][^}]*\}\}/g, '')
}

export interface RenderedCard {
  front: string
  back: string
  warnings: string[]
}

/**
 * Render a card's Front/Back HTML from its model template.
 * `fields` are the note's field values (already media-rewritten by the caller).
 * `ord` is the card ordinal (template index for Basic, cloze ordinal for Cloze).
 */
export function renderCard(
  model: AnkiModel,
  fields: Record<string, string>,
  ord: number,
  _idByFilename: Map<string, string>,
): RenderedCard {
  const warnings: string[] = []
  const tmpl = model.type === 1
    ? model.tmpls[0]
    : (model.tmpls.find((t) => t.ord === ord) ?? model.tmpls[0])

  if (tmpl && /<script/i.test(tmpl.qfmt + tmpl.afmt)) {
    warnings.push(`Note type "${model.name}" uses card-side script, which is not supported; rendered without it.`)
  }

  const substitute = (template: string, side: 'front' | 'back'): string => {
    let out = stripSections(template ?? '')
    // {{cloze:Field}} → cloze-rendered field
    out = out.replace(/\{\{cloze:([^}]+)\}\}/g, (_m, name: string) =>
      renderCloze(fields[name.trim()] ?? '', ord, side))
    // {{Field}} → field value (skip the special {{FrontSide}}, handled below)
    out = out.replace(/\{\{(?!FrontSide)([^}#^/]+?)\}\}/g, (_m, name: string) =>
      fields[name.trim()] ?? '')
    return out
  }

  const front = substitute(tmpl?.qfmt ?? '', 'front')
  const back = substitute(tmpl?.afmt ?? '', 'back').replace(/\{\{FrontSide\}\}/g, front)
  return { front, back, warnings }
}
