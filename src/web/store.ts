import type { LeaderboardEntry } from '../core/signals/types.ts'
import type { StoredFile } from './files.ts'

const DB = 'tm2020-tracker'
const STORE = 'files'

interface Row {
  key: string
  name: string
  bytes: Uint8Array
  added: number
  leaderboard?: LeaderboardEntry
}

export function storeKey(name: string, size: number): string {
  return `${name}:${size}`
}

// browser storage is a convenience, a missing or blocked indexedDB turns every call into a no-op
function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null)
        return
      }
      req = indexedDB.open(DB, 1)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
}

function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
  fallback: T,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve) => {
        if (!db) {
          resolve(fallback)
          return
        }
        try {
          const req = op(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => {
            db.close()
            resolve(req.result)
          }
          req.onerror = () => {
            db.close()
            resolve(fallback)
          }
        } catch {
          db.close()
          resolve(fallback)
        }
      }),
  )
}

export async function listFiles(): Promise<StoredFile[]> {
  const rows = await run<Row[]>('readonly', (s) => s.getAll() as IDBRequest<Row[]>, [])
  return rows
    .sort((a, b) => a.added - b.added)
    .map((r) => ({
      name: r.name,
      bytes: new Uint8Array(r.bytes),
      ...(r.leaderboard ? { leaderboard: r.leaderboard } : {}),
    }))
}

export async function putFile(f: StoredFile): Promise<void> {
  const row: Row = {
    key: storeKey(f.name, f.bytes.length),
    name: f.name,
    bytes: f.bytes,
    added: Date.now(),
    ...(f.leaderboard ? { leaderboard: f.leaderboard } : {}),
  }
  await run<IDBValidKey>('readwrite', (s) => s.put(row), '')
}

export async function deleteFile(name: string, size: number): Promise<void> {
  await run<undefined>('readwrite', (s) => s.delete(storeKey(name, size)), undefined)
}

export async function clearFiles(): Promise<void> {
  await run<undefined>('readwrite', (s) => s.clear(), undefined)
}
