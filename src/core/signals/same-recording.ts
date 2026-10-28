import type { FileContext } from './types.ts'

// a ghost uid or 026 recording id shared by two files
export function sharedRecording(a: FileContext, b: FileContext): string | null {
  if (a.ghost.ghostUid && a.ghost.ghostUid === b.ghost.ghostUid) {
    return `same ghost uid ${a.ghost.ghostUid}`
  }
  if (a.ghost.recordingId && a.ghost.recordingId === b.ghost.recordingId) {
    return `same recording id ${a.ghost.recordingId}`
  }
  return null
}

// two files from one recording under one login (manual save and autosave) are not a pair to
// compare. the game never writes one recording under two logins, that pair is compared and
// split_copy names the shared id
export function sameRecording(a: FileContext, b: FileContext): string | null {
  if (a.ghost.login !== b.ghost.login) {
    return null
  }
  const shared = sharedRecording(a, b)
  return shared ? `${shared}, one recording saved twice` : null
}
