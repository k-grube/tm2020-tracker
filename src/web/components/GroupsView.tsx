import type { Report } from '../../core/signals/types.ts'
import { fmtValue, status } from '../format.ts'

const DOT = { fired: 'bg-red-600', ok: 'bg-green-600', 'n/a': 'bg-zinc-400' } as const

export function GroupsView({ groups }: { groups: Report['groups'] }) {
  if (groups.byMap.length === 0 && groups.byLogin.length === 0) {
    return null
  }
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">across files</h2>
      {groups.byMap.map((g) => (
        <article key={g.mapUid} className="mt-3">
          <h3 className="font-medium break-all">map {g.mapUid}</h3>
          <p className="text-sm break-words text-zinc-500">{g.files.join(', ')}</p>
          <ul className="mt-1 list-disc pl-4 text-sm break-words">
            {g.signals.map((s, i) => (
              <li key={i}>
                <span
                  className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${DOT[status(s)]}`}
                  aria-hidden="true"
                />
                {s.id}: {s.pair[0]} vs {s.pair[1]}, {fmtValue(s)}, {status(s)}. {s.evidence[0]}
              </li>
            ))}
          </ul>
        </article>
      ))}
      {groups.byLogin.map((g) => (
        <article key={g.login} className="mt-3">
          <h3 className="font-medium">login {g.login}</h3>
          <p className="text-sm text-zinc-500">
            {g.files.length} files, wall time ratio{' '}
            {g.wallTimeRatio
              ? `mean ${g.wallTimeRatio.mean.toFixed(3)} (${g.wallTimeRatio.min.toFixed(3)} to ${g.wallTimeRatio.max.toFixed(3)}, n=${g.wallTimeRatio.n})`
              : 'n/a'}
          </p>
        </article>
      ))}
    </section>
  )
}
