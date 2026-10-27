export class ParseError extends Error {
  readonly offset: number

  constructor(message: string, offset: number) {
    super(`${message} (at byte ${offset})`)
    this.name = 'ParseError'
    this.offset = offset
  }
}

export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedError'
  }
}
