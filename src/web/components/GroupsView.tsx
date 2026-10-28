import type { Report } from '../../core/signals/types.ts'
import { fmtValue, status } from '../format.ts'

export function GroupsView({ groups }: { groups: Report['groups'] }) {
  if (groups.byMap.length === 0 && groups.byLogin.length === 0) {
    return null
  }
  return (
    <section className="groups">
      <h2>across files</h2>
      {groups.byMap.map((g) => (
        <article key={g.mapUid} className="group">
          <h3>map {g.mapUid}</h3>
          <p className="meta">{g.files.join(', ')}</p>
          <ul>
            {g.signals.map((s, i) => (
              <li key={i} className={`status-${status(s)}`}>
                <span className="dot" aria-hidden="true" /> {s.id}: {s.pair[0]} vs {s.pair[1]},{' '}
                {fmtValue(s)}, {status(s)}. {s.evidence[0]}
              </li>
            ))}
          </ul>
        </article>
      ))}
      {groups.byLogin.map((g) => (
        <article key={g.login} className="group">
          <h3>login {g.login}</h3>
          <p className="meta">
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
