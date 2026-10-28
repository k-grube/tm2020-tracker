import type { SignalResult } from '../../core/signals/types.ts'
import { fmtRange, fmtValue, status } from '../format.ts'

const STATUS_TEXT = { fired: 'outside reference', ok: 'ok', 'n/a': 'not applicable' } as const
const DOT = { fired: 'bg-red-600', ok: 'bg-green-600', 'n/a': 'bg-zinc-400' } as const

export function SignalCard({ signal }: { signal: SignalResult }) {
  const st = status(signal)
  const stText = st === 'fired' && signal.level === 'absolute' ? 'fired' : STATUS_TEXT[st]
  const border =
    st === 'fired' ? 'border-red-400 dark:border-red-500' : 'border-zinc-200 dark:border-zinc-800'
  return (
    <article className={`rounded-lg border bg-zinc-50 p-3 dark:bg-zinc-900 ${border}`}>
      <header className="flex items-baseline justify-between gap-2">
        <h4 className="font-mono text-sm font-medium">{signal.id}</h4>
        <span className="rounded-full border border-zinc-300 px-2 text-[11px] tracking-wide text-zinc-500 uppercase dark:border-zinc-700">
          {signal.level}
        </span>
      </header>
      <p className="mt-1.5 text-xl font-semibold">{fmtValue(signal)}</p>
      <p className="mt-0.5 mb-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        <span
          className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${DOT[st]}`}
          aria-hidden="true"
        />
        {stText}
      </p>
      <ul className="list-disc pl-4 text-sm break-words text-zinc-500">
        {signal.evidence.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {signal.references.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-sm break-words text-zinc-500">
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
