import { describe, expect, test } from 'vitest'
import { addFiles, fileLabel, type StoredFile } from './files.ts'

const f = (name: string, n: number): StoredFile => ({ name, bytes: new Uint8Array(n) })

describe('addFiles', () => {
  test('appends new files and skips a name and size already present', () => {
    const existing = [f('a.Ghost.Gbx', 10)]
    const { files, added } = addFiles(existing, [f('a.Ghost.Gbx', 10), f('b.Ghost.Gbx', 5)])
    expect(files.map((x) => x.name)).toEqual(['a.Ghost.Gbx', 'b.Ghost.Gbx'])
    expect(added).toEqual([1])
  })

  test('a same name with a different size is a new file', () => {
    const { files } = addFiles([f('a.Ghost.Gbx', 10)], [f('a.Ghost.Gbx', 11)])
    expect(files).toHaveLength(2)
  })
})

describe('fileLabel', () => {
  test('nickname and time when parsed, filename otherwise', () => {
    expect(fileLabel({ name: 'x.Ghost.Gbx', nickname: 'Slidrz', raceTimeMs: 24794 })).toBe(
      'Slidrz 24.794',
    )
    expect(fileLabel({ name: 'x.Ghost.Gbx', nickname: '', raceTimeMs: null })).toBe('x.Ghost.Gbx')
  })
})
