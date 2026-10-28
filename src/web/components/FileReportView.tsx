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
    <section className="mt-10">
      <h2 className="text-lg font-semibold break-all">{report.name}</h2>
      <p className="mt-1 text-sm break-words text-zinc-500">
        login {report.login || '-'}, map {report.mapUid || '-'}, race{' '}
        {report.raceTimeMs === null ? '-' : fmtMs(report.raceTimeMs)}, device {report.device}
      </p>
      <p
        className={`mt-1 mb-3 font-semibold ${summary.needsHumanReview ? 'text-red-600 dark:text-red-400' : ''}`}
      >
        needs human review: {summary.needsHumanReview ? 'yes' : 'no'}
        {summary.absoluteFired.length > 0 && <>, absolute: {summary.absoluteFired.join(' ')}</>}
        {summary.relativeOutside.length > 0 && (
          <>, outside reference: {summary.relativeOutside.join(' ')}</>
        )}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
