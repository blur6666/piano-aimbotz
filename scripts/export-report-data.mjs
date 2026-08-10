// Exports the raw capture behind a report from piano.db into committed CSVs.
//
//   npm run report:data
//
// piano.db is gitignored (.gitignore: *.db), so the database itself is not a
// durable record. These CSVs are: they are plain text, they commit, and every
// number and figure in the report can be rebuilt from them alone. The render
// step reads the CSVs, never the database, so the figures regenerate on a
// fresh clone with no local data.
//
// Re-run this only when the underlying session data changes -- which for a
// finished report means never.

import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'reports', '001-midi-latency', 'data')

// Report 001 covers the whole of the 2026-08-06 C major session, which is
// every run currently in the database. A later report would scope this.
const RUN_FILTER = 'r.id between 1 and 21'

function toCsv(rows) {
  if (rows.length === 0) return ''
  const columns = Object.keys(rows[0])
  const cell = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return (
    [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))]
      .join('\n') + '\n'
  )
}

const db = new DatabaseSync(join(ROOT, 'piano.db'))

// One row per run: the conditions it was played under, plus the assessment the
// app itself stored. Keeping the stored assessment makes the report's claim
// that the figures reproduce the app's scoring checkable forever.
const runs = db
  .prepare(
    `select r.id                                  as run_id,
            r.performed_at_ms,
            s.display_name                        as scale,
            e.direction,
            r.tempo_bpm,
            r.notes_per_beat,
            a.algorithm_version,
            a.hard_fault_count,
            a.timing_fault_count,
            a.overlap_fault_count,
            a.timing_sample_count,
            a.timing_excluded_count,
            a.mean_absolute_timing_deviation_us,
            a.passed
       from runs r
       join exercises e on e.id = r.exercise_id
       join scales s    on s.id = e.scale_id
       left join run_assessments a on a.run_id = r.id
      where ${RUN_FILTER}
      order by r.id`
  )
  .all()

// Every captured MIDI event, note_off included -- note_on alone covers the
// timing analysis, but the releases are what an overlap investigation needs.
const events = db
  .prepare(
    `select m.run_id, m.sequence_number, m.offset_us, m.event_type,
            m.midi_pitch, m.velocity
       from midi_events m
       join runs r on r.id = m.run_id
      where ${RUN_FILTER}
      order by m.run_id, m.sequence_number`
  )
  .all()

// The exercise the session was played against, fingering included. The
// fingering is not decoration here: the thumb crossing between steps 2 and 3
// is the single largest structure in the timing data, so the report cannot be
// rebuilt without it.
const steps = db
  .prepare(
    `select st.step_index, st.note_spelling, st.semitone_offset, st.finger_number
       from exercise_steps st
       join exercises e on e.id = st.exercise_id
       join scales s    on s.id = e.scale_id
      where s.slug = 'c-major' and e.direction = 'ascending'
      order by st.step_index`
  )
  .all()

db.close()

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'runs.csv'), toCsv(runs))
writeFileSync(join(OUT, 'midi-events.csv'), toCsv(events))
writeFileSync(join(OUT, 'exercise-steps.csv'), toCsv(steps))

console.log(
  `wrote reports/001-midi-latency/data/runs.csv           (${runs.length} rows)\n` +
    `wrote reports/001-midi-latency/data/midi-events.csv    (${events.length} rows)\n` +
    `wrote reports/001-midi-latency/data/exercise-steps.csv (${steps.length} rows)`
)
