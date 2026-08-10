import type { AssessmentFault, AssessmentStep } from '../api/runs.js'
import {
  buildRunResultRows,
  buildRunVerdict,
  describeTimingRule,
  type OverlapCell,
  type TimingCell
} from './runResultRows.js'

export type RunResultProps = {
  exerciseSteps: Array<{ noteSpelling: string; fingerNumber: number }>
  assessmentSteps: AssessmentStep[]
  faults: AssessmentFault[]
  events: Array<{ sequenceNumber: number; midiPitch: number }>
  tempoBpm: number
  notesPerBeat: number
  timingToleranceUs: number
  maxTimingFaultsPerRun: number
  hardFaultCount: number
  timingFaultCount: number
  timingStartOffsetUs: number | null
  passed: boolean
}

function signedMs(deviationUs: number): string {
  const ms = deviationUs / 1000
  return `${ms >= 0 ? '+' : '−'}${Math.abs(ms).toFixed(0)} ms`
}

function TimingValue({ cell }: { cell: TimingCell }) {
  if (cell.kind === 'missed') return <span className="cell-void">—</span>
  const className =
    cell.kind === 'outside'
      ? 'cell-bad'
      : cell.kind === 'excluded'
        ? 'cell-void'
        : 'cell-good'
  return (
    <span className={className}>
      {signedMs(cell.deviationUs)}
      {cell.kind === 'excluded' && (
        <em title="Excluded from timing statistics: the note after a stumble is late for reasons that have nothing to do with timing.">
          {' '}
          not counted
        </em>
      )}
    </span>
  )
}

function OverlapValue({ cell }: { cell: OverlapCell }) {
  if (cell.kind === 'none') return <span className="cell-void">—</span>
  if (cell.kind === 'held')
    return <span className="cell-warn">never released</span>
  if (cell.kind === 'clean') return <span className="cell-good">clean</span>
  return (
    <span className="cell-warn">
      {(cell.durationUs / 1000).toFixed(0)} ms bleed
    </span>
  )
}

// End-of-round result: one row per expected note, in playing order, with the
// three things a scale run can go wrong in kept in separate columns because
// they fail independently (SPEC.md: timing and overlap do not correlate).
export function RunResult(props: RunResultProps) {
  const rows = buildRunResultRows({
    exerciseSteps: props.exerciseSteps,
    assessmentSteps: props.assessmentSteps,
    faults: props.faults,
    events: props.events
  })
  const verdict = buildRunVerdict({
    tempoBpm: props.tempoBpm,
    notesPerBeat: props.notesPerBeat,
    timingToleranceUs: props.timingToleranceUs,
    maxTimingFaultsPerRun: props.maxTimingFaultsPerRun,
    hardFaultCount: props.hardFaultCount,
    timingFaultCount: props.timingFaultCount,
    passed: props.passed
  })

  return (
    <div className="run-result">
      <table className="run-result-table">
        <thead>
          <tr>
            <th>Note</th>
            <th>Finger</th>
            <th>Timing</th>
            <th>Overlap</th>
            <th>Wrong notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.stepIndex}
              className={
                row.timing.kind === 'missed' || row.faultLabels.length > 0
                  ? 'row-fault'
                  : ''
              }
            >
              <td className="cell-note">{row.noteSpelling}</td>
              <td className="cell-finger">{row.fingerNumber}</td>
              <td>
                <TimingValue cell={row.timing} />
              </td>
              <td>
                <OverlapValue cell={row.overlap} />
              </td>
              <td>
                {row.faultLabels.length === 0 ? (
                  <span className="cell-void">—</span>
                ) : (
                  <span className="cell-bad">{row.faultLabels.join(', ')}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`verdict ${verdict.passed ? 'verdict-pass' : ''}`}>
        <strong>{verdict.passed ? 'Approved' : 'Not approved'}</strong>
        <p>
          {verdict.passed
            ? 'No wrong notes, every note within '
            : `${verdict.reasons.join('; ')}. Needs no wrong notes and every note within `}
          {describeTimingRule(verdict)}.
        </p>
        <p className="verdict-note">
          {props.timingStartOffsetUs === null
            ? 'Start offset could not be fitted for this run.'
            : `Start offset: ${signedMs(props.timingStartOffsetUs)}. It is shown separately and does not count against evenness.`}
        </p>
        <p className="verdict-note">
          Overlap is measured and shown above but does not decide the result.
        </p>
      </div>
    </div>
  )
}
