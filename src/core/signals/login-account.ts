import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

const LOGIN_RE = /^[A-Za-z0-9_-]{22}$/
const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

// a tm2020 login is the account uuid in base64url without padding
export function loginToAccountId(login: string): string | null {
  if (!LOGIN_RE.test(login)) {
    return null
  }
  const b64 = login.replace(/-/g, '+').replace(/_/g, '/') + '=='
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  if (bytes.length !== 16) {
    return null
  }
  return [
    hex(bytes.subarray(0, 4)),
    hex(bytes.subarray(4, 6)),
    hex(bytes.subarray(6, 8)),
    hex(bytes.subarray(8, 10)),
    hex(bytes.subarray(10, 16)),
  ].join('-')
}

// the login written into the ghost against the account the leaderboard credits the record to
export const loginAccount: Detector = (ctx) => {
  const entry = ctx.leaderboard
  if (!entry) {
    return notApplicable('login_account', 'absolute', 'needs the leaderboard entry of the record')
  }
  const login = ctx.ghost.login
  const account = loginToAccountId(login)
  if (!account) {
    return notApplicable('login_account', 'absolute', `login ${login} is not an account id`)
  }
  return {
    id: 'login_account',
    level: 'absolute',
    applicable: true,
    fired: account !== entry.accountId.toLowerCase(),
    value: null,
    unit: '',
    evidence: [`login ${login} is account ${account}, leaderboard account ${entry.accountId}`],
    references: [],
  }
}
