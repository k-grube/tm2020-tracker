import { readFileSync, writeFileSync } from 'node:fs'

export function readFileBytes(path: string): Uint8Array {
  const buf = readFileSync(path)
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}
