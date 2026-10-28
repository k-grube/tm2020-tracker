import type { Checkpoint } from '../../core/model.ts'
import { fmtMs } from '../format.ts'

const CELL = 'border-b border-zinc-200 py-0.5 pr-3 text-right dark:border-zinc-800'

export function CheckpointTable({ checkpoints }: { checkpoints: Checkpoint[] }) {
  if (checkpoints.length === 0) {
    return null
  }
  return (
    <table className="mt-4 border-collapse text-sm tabular-nums">
      <caption className="mb-1 text-left text-sm text-zinc-500">checkpoints</caption>
      <thead>
        <tr>
          <th className={`${CELL} font-medium text-zinc-500`}>#</th>
          <th className={`${CELL} font-medium text-zinc-500`}>time</th>
          <th className={`${CELL} font-medium text-zinc-500`}>split</th>
        </tr>
      </thead>
      <tbody>
        {checkpoints.map((cp, i) => (
          <tr key={i}>
            <td className={CELL}>{i + 1}</td>
            <td className={CELL}>{fmtMs(cp.timeMs)}</td>
            <td className={CELL}>{fmtMs(cp.timeMs - (checkpoints[i - 1]?.timeMs ?? 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
