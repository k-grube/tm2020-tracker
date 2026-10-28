import type { Checkpoint } from '../../core/model.ts'
import { fmtMs } from '../format.ts'

export function CheckpointTable({ checkpoints }: { checkpoints: Checkpoint[] }) {
  if (checkpoints.length === 0) {
    return null
  }
  return (
    <table className="checkpoints">
      <caption>checkpoints</caption>
      <thead>
        <tr>
          <th>#</th>
          <th>time</th>
          <th>split</th>
        </tr>
      </thead>
      <tbody>
        {checkpoints.map((cp, i) => (
          <tr key={i}>
            <td>{i + 1}</td>
            <td>{fmtMs(cp.timeMs)}</td>
            <td>{fmtMs(cp.timeMs - (checkpoints[i - 1]?.timeMs ?? 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
