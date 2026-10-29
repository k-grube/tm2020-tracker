import { describe, expect, test } from 'vitest'
import { inflateNode } from '../../cli/inflate.ts'
import { loadFixture } from '../../test/fixtures.ts'
import { analyzeBytes } from '../pipeline.ts'
import { loginAccount, loginToAccountId } from './login-account.ts'
import { metadata } from './metadata.ts'
import { fakeCtx } from './test-util.ts'

const LOGIN = 'ABEiM0RVZneImaq7zN3u_w'
const ID = '00112233-4455-6677-8899-aabbccddeeff'
const OTHER = 'ffffffff-0000-0000-0000-000000000000'

describe('loginToAccountId', () => {
  test('decodes the 22 character base64url login to the account uuid', () => {
    expect(loginToAccountId(LOGIN)).toBe(ID)
  })

  test('anything else is null', () => {
    expect(loginToAccountId('login')).toBeNull()
    expect(loginToAccountId('')).toBeNull()
    expect(loginToAccountId('ABEiM0RVZneImaq7zN3u_w==')).toBeNull()
  })
})

describe('login_account', () => {
  const ctx = (login: string, accountId: string) =>
    fakeCtx({ ghost: { login }, leaderboard: { accountId, timestamp: null } })

  test('the leaderboard account matching the login does not fire', () => {
    const r = loginAccount(ctx(LOGIN, ID), null)
    expect(r.level).toBe('absolute')
    expect(r.applicable).toBe(true)
    expect(r.fired).toBe(false)
    expect(r.evidence[0]).toBe(`login ${LOGIN} is account ${ID}, leaderboard account ${ID}`)
  })

  test('another account fires', () => {
    const r = loginAccount(ctx(LOGIN, OTHER), null)
    expect(r.fired).toBe(true)
    expect(r.evidence[0]).toBe(`login ${LOGIN} is account ${ID}, leaderboard account ${OTHER}`)
  })

  test('case of the id does not matter', () => {
    expect(loginAccount(ctx(LOGIN, ID.toUpperCase()), null).fired).toBe(false)
  })

  test('not applicable without a leaderboard entry or with a login that is not an account', () => {
    expect(loginAccount(fakeCtx({ ghost: { login: LOGIN } }), null).applicable).toBe(false)
    const r = loginAccount(ctx('login', ID), null)
    expect(r.applicable).toBe(false)
    expect(r.evidence[0]).toBe('login login is not an account id')
  })

  test('rides along with the file through analyzeBytes', async () => {
    const file = {
      name: 's',
      bytes: loadFixture('slidrz'),
      leaderboard: { accountId: OTHER, timestamp: null },
    }
    const r = (await analyzeBytes([file], null, inflateNode)).files[0]!
    expect(r.signals.find((s) => s.id === 'login_account')!.fired).toBe(true)
    expect(r.summary.absoluteFired).toContain('login_account')
  })
})

describe('metadata with a leaderboard entry', () => {
  test('lists the account and the stamp against the wall end', () => {
    const ctx = fakeCtx({
      ghost: { login: LOGIN, wallTime: { startUnixSec: 1000, endUnixSec: 1020, source: '02C' } },
      leaderboard: { accountId: ID, timestamp: '1970-01-01T00:17:05+00:00' },
    })
    expect(metadata(ctx, null).evidence).toContain(
      `leaderboard account ${ID}, set 1970-01-01T00:17:05+00:00, 5 s after the wall end`,
    )
  })

  test('without a stamp or a wall end only the account', () => {
    const ctx = fakeCtx({
      ghost: { login: LOGIN },
      leaderboard: { accountId: ID, timestamp: null },
    })
    expect(metadata(ctx, null).evidence).toContain(`leaderboard account ${ID}, set -`)
  })
})
