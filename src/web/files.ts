import { fmtMs } from './format.ts'

export interface StoredFile {
  name: string
  bytes: Uint8Array
}

// append files not already held (same name and size), returns the indexes that were added
export function addFiles(
  existing: StoredFile[],
  incoming: StoredFile[],
): { files: StoredFile[]; added: number[] } {
  const files = [...existing]
  const added: number[] = []
  for (const f of incoming) {
    if (files.some((x) => x.name === f.name && x.bytes.length === f.bytes.length)) {
      continue
    }
    added.push(files.length)
    files.push(f)
  }
  return { files, added }
}

export function fileLabel(f: {
  name: string
  nickname: string
  raceTimeMs: number | null
}): string {
  if (f.nickname && f.raceTimeMs !== null) {
    return `${f.nickname} ${fmtMs(f.raceTimeMs)}`
  }
  return f.name
}
