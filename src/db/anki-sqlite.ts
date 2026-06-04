import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let sqlPromise: ReturnType<typeof initSqlJs> | null = null

/** Open Anki collection bytes with sql.js in the browser (WASM via Vite ?url). */
export async function openCollection(bytes: Uint8Array): Promise<Database> {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => wasmUrl })
  const SQL = await sqlPromise
  return new SQL.Database(bytes)
}
