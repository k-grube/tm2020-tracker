import type { SignalResult } from '../../core/signals/types.ts'
import { fmtRange, fmtValue, status } from '../format.ts'

const STATUS_TEXT = { fired: 'outside reference', ok: 'ok', 'n/a': 'not applicable' } as const

export function SignalCard({ signal }: { signal: SignalResult }) {
  const st = status(signal)
  const stText = st === 'fired' && signal.level === 'absolute' ? 'fired' : STATUS_TEXT[st]
  return (
    <article className={`signal signal-${st}`}>
      <header>
        <h4>{signal.id}</h4>
        <span className={`chip level-${signal.level}`}>{signal.level}</span>
      </header>
      <p className="value">{fmtValue(signal)}</p>
      <p className={`status status-${st}`}>
        <span className="dot" aria-hidden="true" /> {stText}
      </p>
      <ul className="evidence">
        {signal.evidence.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {signal.references.length > 0 && (
        <ul className="references">
          {signal.references.map((r) => (
            <li key={r.label}>
              {r.label}: {fmtRange(r)}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
