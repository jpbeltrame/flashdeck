import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../db/db'
import { buildCollection, zipApkg, openFromBytes } from '../domain/anki/__fixtures__/build-apkg'
import ImportPage from './ImportPage'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

async function sampleFile(): Promise<File> {
  const models = {
    '1': { id: '1', name: 'Basic', type: 0, flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
      tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }] },
  }
  const cdb = await buildCollection({
    crt: 1_600_000_000, models, decks: { '1': { id: '1', name: 'Default' } },
    notes: [{ id: 10, mid: '1', flds: 'Q\x1fA' }],
    cards: [{ id: 100, nid: 10, did: 1, ord: 0, type: 0 }],
  })
  return new File([zipApkg(cdb)], 'sample.apkg')
}

describe('ImportPage', () => {
  it('imports a chosen .apkg and shows a summary', async () => {
    const user = userEvent.setup()
    render(<ImportPage openDb={openFromBytes} />)
    await user.upload(screen.getByLabelText(/choose .apkg/i), await sampleFile())

    expect(await screen.findByText(/imported/i)).toBeInTheDocument()
    expect(await screen.findByText(/1 deck/i)).toBeInTheDocument()
    expect(await db.cards.count()).toBe(1)
  })
})
