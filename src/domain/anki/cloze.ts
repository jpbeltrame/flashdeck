// Matches {{cN::answer}} or {{cN::answer::hint}}. Non-greedy answer so adjacent
// clozes don't merge.
const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g

/** Unique 0-based ordinals present (cloze c1 => ordinal 0). */
export function clozeOrdinals(text: string): number[] {
  const found = new Set<number>()
  for (const m of text.matchAll(CLOZE_RE)) found.add(Number(m[1]) - 1)
  return [...found].sort((a, b) => a - b)
}

/** Render a cloze field for a card ordinal (0-based) and side. */
export function renderCloze(text: string, ord: number, side: 'front' | 'back'): string {
  const active = ord + 1
  return text.replace(CLOZE_RE, (_full, numStr: string, answer: string, hint?: string) => {
    const num = Number(numStr)
    if (num !== active) return answer // other clozes always show their answer
    if (side === 'back') return `<span class="cloze">${answer}</span>`
    return `<span class="cloze">[${hint && hint.length > 0 ? hint : '...'}]</span>`
  })
}
