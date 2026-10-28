import type { FileReport } from '../../core/signals/types.ts'
import type { FileViz } from '../viz.ts'
import { fmtMs } from '../format.ts'
import { SignalCard } from './SignalCard.tsx'
import { SteerTrace } from './SteerTrace.tsx'
import { InputTimeline } from './InputTimeline.tsx'
import { CheckpointTable } from './CheckpointTable.tsx'

export function FileReportView({ report, viz }: { report: FileReport; viz: FileViz | null }) {
  const { summary } = report
  return (
    <section className="file">
      <h2>{report.name}</h2>
      <p className="meta">
        login {report.login || '-'}, map {report.mapUid || '-'}, race{' '}
        {report.raceTimeMs === null ? '-' : fmtMs(report.raceTimeMs)}, device {report.device}
      </p>
      <p className={`review review-${summary.needsHumanReview ? 'yes' : 'no'}`}>
        needs human review: {summary.needsHumanReview ? 'yes' : 'no'}
        {summary.absoluteFired.length > 0 && <>, absolute: {summary.absoluteFired.join(' ')}</>}
        {summary.relativeOutside.length > 0 && (
          <>, outside reference: {summary.relativeOutside.join(' ')}</>
        )}
      </p>
      <div className="signals">
        {report.signals.map((s) => (
          <SignalCard key={s.id} signal={s} />
        ))}
      </div>
      {viz?.steer && viz.steer.length > 0 && <SteerTrace steer={viz.steer} />}
      {viz && <InputTimeline events={viz.events} ticks={viz.ticks} />}
      {viz && <CheckpointTable checkpoints={viz.checkpoints} />}
    </section>
  )
}
