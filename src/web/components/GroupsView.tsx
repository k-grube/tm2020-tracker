import type { FileReport, Report } from '../../core/signals/types.ts'
import { fmtValue } from '../format.ts'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// pairs on a map that fired, named by nickname, plus the per-login wall time aggregate
export function GroupsView({ groups, files }: { groups: Report['groups']; files: FileReport[] }) {
  if (groups.byMap.length === 0 && groups.byLogin.length === 0) {
    return null
  }
  const nick = new Map(files.map((f) => [f.name, f.nickname || f.name]))
  const label = (name: string) => nick.get(name) ?? name
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">across files</h2>
      {groups.byMap.map((g) => {
        const pairs = g.signals.filter((s) => s.id === 'trajectory_overlap').length
        const flagged = g.signals.filter((s) => s.fired)
        return (
          <article key={g.mapUid} className="mt-3">
            <h3 className="font-medium break-all">map {g.mapUid}</h3>
            <p className="text-sm text-zinc-500">
              {plural(g.files.length, 'file')}, {plural(pairs, 'pair')}, {flagged.length} flagged
            </p>
            {flagged.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-sm break-words">
                {flagged.map((s, i) => (
                  <li key={i}>
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600 align-middle"
                      aria-hidden="true"
                    />
                    {s.id}: {label(s.pair[0])} vs {label(s.pair[1])}, {fmtValue(s)}. {s.evidence[0]}
                  </li>
                ))}
              </ul>
            )}
          </article>
        )
      })}
      {groups.byLogin.map((g) => (
        <article key={g.login} className="mt-3">
          <h3 className="font-medium">login {g.login}</h3>
          <p className="text-sm text-zinc-500">
            {plural(g.files.length, 'file')}, wall time ratio{' '}
            {g.wallTimeRatio
              ? `mean ${g.wallTimeRatio.mean.toFixed(3)} (${g.wallTimeRatio.min.toFixed(3)} to ${g.wallTimeRatio.max.toFixed(3)}, n=${g.wallTimeRatio.n})`
              : 'n/a'}
          </p>
        </article>
      ))}
    </section>
  )
}
