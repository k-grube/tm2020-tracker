import { describe, expect, test } from 'vitest'
import { clearFiles, deleteFile, listFiles, putFile, storeKey } from './store.ts'

describe('storeKey', () => {
  test('name and size', () => {
    expect(storeKey('a.Ghost.Gbx', 10)).toBe('a.Ghost.Gbx:10')
  })
})

describe('without indexedDB', () => {
  test('every call resolves and the list is empty', async () => {
    expect(typeof globalThis.indexedDB).toBe('undefined')
    await expect(listFiles()).resolves.toEqual([])
    await expect(putFile({ name: 'a', bytes: new Uint8Array(1) })).resolves.toBeUndefined()
    await expect(deleteFile('a', 1)).resolves.toBeUndefined()
    await expect(clearFiles()).resolves.toBeUndefined()
  })
})
