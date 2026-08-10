# Plan — Support two-octave scales

> **For the implementing agent:** every code block below is literal — type it as
> written. Do not derive fingerings, invent SQL, or improvise names. Work the
> steps in order; each step lists exactly which file to touch. Run
> `npm run lint && npm test` after each numbered section.

## Context

Eight steps per exercise is hard-coded in five places: three SQL `CHECK`
constraints, the catalog validator (`src/domain/catalog/index.ts`), and the wire
contract (`src/shared/contracts.ts`). A two-octave scale cannot be seeded,
submitted or scored.

Beyond being a real practice gap, this blocks the follow-up experiment report
001 (`reports/001-midi-latency/REPORT.md`) asks for: two-octave C major
ascending is fingered `1 2 3 1 2 3 4 1 2 3 1 2 3 4 5`, which contains **three**
thumb crossings instead of one. That tests whether the approach-drag report 001
found recurs at every crossing, and whether the B→C crossing (thumb after
finger 4) behaves like the E→F ones (thumb after finger 3).

**Scope:** two-octave variants for the seven scales whose fingering SPEC.md
fixes and both catalog sources agree on — C, G, D, A, E, B (Group 1) and F
(Group 2). The five black-key scales stay one-octave; their two-octave
fingering is not derivable from their one-octave pattern and needs sourcing
from the pianoscales.org reference first.

Catalog goes 24 → **38** exercises (12 scales × 2 directions, plus 7 scales × 2
directions at two octaves).

This plan changes no scoring maths. A companion plan,
`docs/plans/latency-investigation-backlog-entry.md`, handles the separate open
question of latency compensation.

---

## Step 1 — Migration

Create `migrations/0008_two_octave_exercises.sql` with exactly this content:

```sql
-- Two-octave exercises are 15 steps spanning 24 semitones, not 8 spanning 12.
-- Four constraints assumed one octave of eight steps. SQLite cannot ALTER a
-- CHECK, so each affected table is rebuilt (CREATE new / copy / DROP old /
-- RENAME), the same pattern migrations 0005 and 0006 already use.
--
-- exercises.octaves defaults to 1 so the 24 existing exercises backfill
-- truthfully -- every one of them was played a single octave -- exactly as
-- 0007 did for notes_per_beat.

CREATE TABLE exercises_new (
  id INTEGER PRIMARY KEY,
  scale_id INTEGER NOT NULL REFERENCES scales(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('ascending', 'descending')),
  octaves INTEGER NOT NULL DEFAULT 1 CHECK (octaves IN (1, 2)),
  UNIQUE (scale_id, direction, octaves)
);

INSERT INTO exercises_new (id, scale_id, direction, octaves)
SELECT id, scale_id, direction, 1 FROM exercises;

DROP TABLE exercises;

ALTER TABLE exercises_new RENAME TO exercises;

CREATE TABLE exercise_steps_new (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL CHECK (step_index BETWEEN 0 AND 14),
  note_spelling TEXT NOT NULL CHECK (length(note_spelling) > 0),
  semitone_offset INTEGER NOT NULL CHECK (semitone_offset BETWEEN -24 AND 24),
  finger_number INTEGER NOT NULL CHECK (finger_number BETWEEN 1 AND 5),
  UNIQUE (exercise_id, step_index)
);

INSERT INTO exercise_steps_new (
  id, exercise_id, step_index, note_spelling, semitone_offset, finger_number
)
SELECT id, exercise_id, step_index, note_spelling, semitone_offset, finger_number
FROM exercise_steps;

DROP TABLE exercise_steps;

ALTER TABLE exercise_steps_new RENAME TO exercise_steps;

CREATE TABLE run_assessments_new (
  run_id INTEGER PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  algorithm_version TEXT NOT NULL CHECK (length(algorithm_version) > 0),
  scoring_parameters TEXT NOT NULL CHECK (json_valid(scoring_parameters) AND json_type(scoring_parameters) = 'object'),
  progression_policy_version TEXT NOT NULL CHECK (length(progression_policy_version) > 0),
  progression_parameters TEXT NOT NULL CHECK (json_valid(progression_parameters) AND json_type(progression_parameters) = 'object'),
  hard_fault_count INTEGER NOT NULL CHECK (hard_fault_count >= 0),
  timing_fault_count INTEGER NOT NULL CHECK (timing_fault_count >= 0),
  overlap_fault_count INTEGER NOT NULL CHECK (overlap_fault_count >= 0),
  timing_sample_count INTEGER NOT NULL CHECK (timing_sample_count >= 0),
  timing_excluded_count INTEGER NOT NULL CHECK (timing_excluded_count >= 0),
  mean_absolute_timing_deviation_us INTEGER CHECK (mean_absolute_timing_deviation_us IS NULL OR mean_absolute_timing_deviation_us >= 0),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  assessed_at_ms INTEGER NOT NULL CHECK (assessed_at_ms >= 0),
  CHECK (timing_fault_count <= timing_sample_count),
  CHECK (timing_sample_count + timing_excluded_count <= 15),
  CHECK ((timing_sample_count = 0 AND mean_absolute_timing_deviation_us IS NULL) OR (timing_sample_count > 0 AND mean_absolute_timing_deviation_us IS NOT NULL))
);

INSERT INTO run_assessments_new SELECT * FROM run_assessments;

DROP TABLE run_assessments;

ALTER TABLE run_assessments_new RENAME TO run_assessments;
```

Then in `src/server/db/migration-files.ts`, append to the `MIGRATION_FILES`
array (order matters — it must be last):

```ts
  '0008_two_octave_exercises.sql'
```

`applyMigrations` (`src/server/db/apply-migrations.ts:33`) already disables
`foreign_keys` around each migration and runs `foreign_key_check` afterwards.
No extra handling needed.

---

## Step 2 — Catalog types

In `src/domain/catalog/index.ts`, add `octaves` to `CatalogExercise`:

```ts
export type CatalogExercise = {
  direction: 'ascending' | 'descending'
  // 1 or 2. A two-octave exercise has 15 steps spanning 24 semitones.
  octaves: number
  steps: readonly CatalogStep[]
}
```

---

## Step 3 — Catalog data

In `catalog/v1.ts`, replace the `ASCENDING_OFFSETS` constant and the whole
`buildExercises` function with this. Everything else in the file stays.

```ts
// A major scale's interval pattern (W-W-H-W-W-W-H) is identical in every
// key, so the ascending semitone offsets from the tonic never change --
// only note spellings and right-hand fingering vary per scale.
const ASCENDING_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12] as const

// Two octaves repeat the same seven-degree cycle a twelfth higher, then close
// on the upper tonic: 0 2 4 5 7 9 11 | 12 14 16 17 19 21 23 | 24.
const TWO_OCTAVE_ASCENDING_OFFSETS = [
  ...ASCENDING_OFFSETS.slice(0, 7),
  ...ASCENDING_OFFSETS.slice(0, 7).map((offset) => offset + 12),
  24
] as const

// The seven scales whose two-octave fingering follows from data this catalog
// already documents. The five black-key scales are deliberately absent: their
// one-octave patterns do not start on the thumb, so the repeat below is not
// valid for them and no source here states their two-octave fingering.
const TWO_OCTAVE_SCALE_SLUGS = new Set([
  'c-major',
  'g-major',
  'd-major',
  'a-major',
  'e-major',
  'b-major',
  'f-major'
])

// Two octaves reuse the one-octave cycle: the first seven values repeat, then
// the original closing value ends the scale. Same discipline as the descending
// derivation below -- no new fingering data is invented, it is mechanically
// derived from the one-octave pattern. Verified against both patterns in
// scope:
//   Group 1 [1,2,3,1,2,3,4,5] -> 1 2 3 1 2 3 4 | 1 2 3 1 2 3 4 | 5
//   F major [1,2,3,4,1,2,3,4] -> 1 2 3 4 1 2 3 | 1 2 3 4 1 2 3 | 4
// The F result keeps the thumb on F and C throughout, which is the standard
// right hand for that scale.
function repeatCycle<T>(values: readonly T[]): T[] {
  const cycle = values.slice(0, 7)
  return [...cycle, ...cycle, values[7]]
}

// Descending is the exact reverse of ascending: notes, offsets (mirrored
// around the upper tonic), and fingering. Matches the precedent already
// set for C major descending (AGENTS.md: "Fingering is the reverse of
// known ascending; no new data needed") -- no new descending data is
// invented here, it is mechanically derived.
function buildOctaveExercises(
  def: ScaleDefinition,
  octaves: number
): CatalogExercise[] {
  const notes =
    octaves === 1 ? [...def.ascendingNotes] : repeatCycle(def.ascendingNotes)
  const fingering =
    octaves === 1
      ? [...def.ascendingFingering]
      : repeatCycle(def.ascendingFingering)
  const offsets =
    octaves === 1 ? ASCENDING_OFFSETS : TWO_OCTAVE_ASCENDING_OFFSETS
  const span = 12 * octaves

  const ascendingSteps: CatalogStep[] = notes.map(
    (noteSpelling, index): CatalogStep => [
      noteSpelling,
      offsets[index],
      fingering[index]
    ]
  )
  const descendingSteps: CatalogStep[] = [...ascendingSteps]
    .reverse()
    .map(
      ([noteSpelling, offset, fingerNumber]): CatalogStep => [
        noteSpelling,
        offset - span,
        fingerNumber
      ]
    )
  return [
    { direction: 'ascending', octaves, steps: ascendingSteps },
    { direction: 'descending', octaves, steps: descendingSteps }
  ]
}

function buildExercises(def: ScaleDefinition): readonly CatalogExercise[] {
  const exercises = buildOctaveExercises(def, 1)
  if (TWO_OCTAVE_SCALE_SLUGS.has(def.slug))
    exercises.push(...buildOctaveExercises(def, 2))
  return exercises
}
```

Also update the file's opening comment — it currently says
`24 exercises (ascending + descending per scale), 8 steps each`. Replace that
clause with:

```
// 38 exercises: ascending + descending per scale at one octave (8 steps),
// plus the same at two octaves (15 steps) for Group 1 and F.
```

---

## Step 4 — Catalog validator

In `src/domain/catalog/index.ts`, replace `validateScaleExercises` and
`validateSteps` entirely with:

```ts
function validateScaleExercises(scale: CatalogScale): void {
  const byOctaves = new Map<number, CatalogExercise[]>()
  for (const exercise of scale.exercises) {
    if (exercise.octaves !== 1 && exercise.octaves !== 2)
      throw new Error(
        `Scale "${scale.slug}" has an exercise with octaves ${exercise.octaves}, expected 1 or 2.`
      )
    const list = byOctaves.get(exercise.octaves) ?? []
    list.push(exercise)
    byOctaves.set(exercise.octaves, list)
  }

  if (!byOctaves.has(1))
    throw new Error(
      `Scale "${scale.slug}" must have one-octave exercises; found only [${[...byOctaves.keys()].join(', ')}].`
    )

  // Every octave count a scale offers must be a complete ascending/descending
  // pair, and the mirror-fingering rule holds within that pair rather than
  // across the scale as a whole.
  for (const [octaves, exercises] of byOctaves) {
    if (exercises.length !== 2)
      throw new Error(
        `Scale "${scale.slug}" must have exactly 2 ${octaves}-octave exercises (ascending and descending), found ${exercises.length}.`
      )
    const ascending = exercises.find(
      (exercise) => exercise.direction === 'ascending'
    )
    const descending = exercises.find(
      (exercise) => exercise.direction === 'descending'
    )
    if (!ascending || !descending)
      throw new Error(
        `Scale "${scale.slug}" must have exactly one ascending and one descending ${octaves}-octave exercise, found directions [${exercises.map((exercise) => exercise.direction).join(', ')}].`
      )

    validateSteps(scale, ascending)
    validateSteps(scale, descending)

    const ascendingFingering = ascending.steps.map(
      ([, , fingerNumber]) => fingerNumber
    )
    const descendingFingering = descending.steps.map(
      ([, , fingerNumber]) => fingerNumber
    )
    const reversedAscendingFingering = [...ascendingFingering].reverse()
    if (
      descendingFingering.some(
        (finger, index) => finger !== reversedAscendingFingering[index]
      )
    )
      throw new Error(
        `Scale "${scale.slug}" ${octaves}-octave descending fingering [${descendingFingering.join(', ')}] must be the exact reverse of ascending [${ascendingFingering.join(', ')}].`
      )
  }
}

function validateSteps(scale: CatalogScale, exercise: CatalogExercise): void {
  const label = `${scale.slug} ${exercise.direction} ${exercise.octaves}-octave`
  // Seven degrees per octave plus the closing tonic: 8 steps for one octave,
  // 15 for two.
  const expectedStepCount = exercise.octaves * 7 + 1
  if (exercise.steps.length !== expectedStepCount)
    throw new Error(
      `Exercise "${label}" must have exactly ${expectedStepCount} steps, found ${exercise.steps.length}.`
    )

  const [, firstOffset] = exercise.steps[0]
  if (firstOffset !== 0)
    throw new Error(
      `Exercise "${label}" step 0 must have semitoneOffset 0, found ${firstOffset}.`
    )

  const lastIndex = expectedStepCount - 1
  const [, lastOffset] = exercise.steps[lastIndex]
  const expectedLastOffset =
    (exercise.direction === 'ascending' ? 12 : -12) * exercise.octaves
  if (lastOffset !== expectedLastOffset)
    throw new Error(
      `Exercise "${label}" step ${lastIndex} must have semitoneOffset ${expectedLastOffset}, found ${lastOffset}.`
    )

  for (let index = 0; index < exercise.steps.length; index += 1) {
    const [noteSpelling, offset, fingerNumber] = exercise.steps[index]

    if (fingerNumber < 1 || fingerNumber > 5)
      throw new Error(
        `Exercise "${label}" step ${index} has fingerNumber ${fingerNumber}, outside 1..5.`
      )

    const expectedPitchClass = PITCH_CLASS_BY_SPELLING[noteSpelling]
    if (expectedPitchClass === undefined)
      throw new Error(
        `Exercise "${label}" step ${index} has unrecognized note spelling "${noteSpelling}".`
      )
    if (mod12(scale.tonicPitchClass + offset) !== expectedPitchClass)
      throw new Error(
        `Exercise "${label}" step ${index}: note spelling "${noteSpelling}" (pitch class ${expectedPitchClass}) ` +
          `does not match tonicPitchClass ${scale.tonicPitchClass} + semitoneOffset ${offset}.`
      )

    if (index > 0) {
      const [, previousOffset] = exercise.steps[index - 1]
      const strictlyOrdered =
        exercise.direction === 'ascending'
          ? offset > previousOffset
          : offset < previousOffset
      if (!strictlyOrdered)
        throw new Error(
          `Exercise "${label}" offsets must be strictly ${exercise.direction === 'ascending' ? 'increasing' : 'decreasing'}; step ${index} (${offset}) violates that against step ${index - 1} (${previousOffset}).`
        )
    }
  }
}
```

Then in `validateCatalog`, immediately after the existing
`if (seenTonicPitchClasses.size !== 12)` block and before the
`for (const scale of allScales) validateScaleExercises(scale)` line, insert:

```ts
  // Two-octave coverage is deliberately partial (Group 1 plus F). Asserting
  // the exact count means a half-applied catalog change fails loudly here
  // rather than surfacing as a missing exercise in the picker.
  const twoOctaveScaleCount = allScales.filter((scale) =>
    scale.exercises.some((exercise) => exercise.octaves === 2)
  ).length
  if (twoOctaveScaleCount !== 7)
    throw new Error(
      `Catalog must define two-octave exercises for exactly 7 scales (Group 1 plus F), found ${twoOctaveScaleCount}.`
    )
```

---

## Step 5 — Wire contract

In `src/shared/contracts.ts`:

```ts
export const ExerciseStepSchema = Type.Object({
  stepIndex: Type.Integer({ minimum: 0, maximum: 14 }),
  noteSpelling: Type.String({ minLength: 1 }),
  fingerNumber: Type.Integer({ minimum: 1, maximum: 5 })
})
```

And add one property to `ExerciseSchema`, directly after `direction`:

```ts
  // 1 or 2. The client needs it to label the picker and size the on-screen
  // keyboard; step count follows from it as octaves * 7 + 1.
  octaves: Type.Integer({ minimum: 1, maximum: 2 }),
```

---

## Step 6 — Server

**`src/server/db/seed.ts`** — in `seedExercise` (around line 125), both
statements must key on octaves:

```ts
  const existing = sqlite
    .prepare(
      'SELECT id FROM exercises WHERE scale_id = ? AND direction = ? AND octaves = ?'
    )
    .get(scaleId, exercise.direction, exercise.octaves) as
    | { id: number }
    | undefined
  if (existing) return existing.id

  const inserted = sqlite
    .prepare(
      `INSERT INTO exercises (scale_id, direction, octaves)
       VALUES (?, ?, ?)
       RETURNING id`
    )
    .get(scaleId, exercise.direction, exercise.octaves) as { id: number }
  return inserted.id
```

Nothing else in `seed.ts` changes — the loop at line 27 already iterates
`scale.exercises` generically, and `seedExerciseSteps` / `seedExerciseProgress`
are already per-exercise, so each two-octave exercise gets its own tempo ladder
and streak automatically.

**`src/server/exercises/routes.ts`** — three edits:

1. Add `octaves: number` to the `ExerciseRow` type (line 11).
2. Add `e.octaves AS octaves,` to the `SELECT` list, directly after the
   `e.direction AS direction,` line.
3. Add `octaves: row.octaves,` to the `Exercise` object literal (line 89),
   directly after `direction: row.direction,`.

**No change needed** in `src/server/runs/create-run.ts`,
`src/server/runs/read-run.ts`, `src/server/db/backfill-assessments.ts`, or
`src/domain/scoring.ts` — all four already read whatever steps the exercise
has. Do not touch them.

---

## Step 7 — Client

**`src/client/practice/runExercise.ts:71` — the one real trap.** Currently:

```ts
  const scaleBeats = exercise.steps.length / exercise.notesPerBeat
```

15 steps at 2 notes per beat gives `7.5`. The metronome loop
(`src/client/metronome/index.ts:66-68`) iterates integer beat indices and
derives its silent tail beat from that total, so a fractional value corrupts
both the click schedule and the capture window. Replace with:

```ts
  // Math.ceil because an odd step count at two notes per beat lands the final
  // onset mid-beat: 15 eighths span 7.5 beats, and the loop that schedules
  // clicks and the tail beat only understands whole ones. Rounding up leaves
  // the tail a full beat past the last note, which is what it is for.
  const scaleBeats = Math.ceil(exercise.steps.length / exercise.notesPerBeat)
```

**`src/client/practice/Keyboard.tsx:23`** — a two-octave scale spans C4 to C6,
which needs three drawn octaves:

```ts
export const OCTAVE_COUNT = 3
```

Every width in that file already derives from the constant, and
`resolveScaleKeys` (`src/client/practice/noteNames.ts:45`) already tracks octave
wrap generically. Nothing else in either file changes.

**`src/client/api/exercises.ts:21`** — without this, two "C major ascending"
entries appear in the picker:

```ts
          label:
            exercise.octaves === 1
              ? `${scale.displayName} ${exercise.direction}`
              : `${scale.displayName} ${exercise.direction} (${exercise.octaves} octaves)`
```

**`src/client/practice/Timeline.tsx`** — the component is generic over
`steps.length`, but the stylesheet is not (see below). Pass the count down by
adding a custom property to the root element (line 86):

```tsx
    <div
      className="timeline"
      aria-hidden="true"
      style={{ '--step-count': stepCount } as React.CSSProperties}
    >
```

The cast is needed because custom properties are not in React's
`CSSProperties` index.

**`src/client/styles.css`** — two hard-coded eights. At line 231:

```css
.timeline-pads {
  display: grid;
  grid-template-columns: repeat(var(--step-count, 8), 1fr);
}
```

And in `.timeline-track` (line 244), the gradient's final stop is `12.5%`,
i.e. one eighth. Change that one line:

```css
    transparent calc(100% / var(--step-count, 8))
```

Leave the rest of both rules alone. The `8` fallbacks keep the pre-existing
look if the property ever fails to land.

**`src/client/main.tsx`** — no change. The picker already filters to
`direction === 'ascending'` (lines 100–103 and 126), so two-octave ascending
appears and its descending twin stays hidden, matching today's behaviour.

---

## Step 8 — Tests

Update these existing assertions:

- **`tests/catalog.test.ts:73`** — the test "rejects an exercise without exactly
  8 steps" expects `/must have exactly 8 steps, found 7/`. Fixtures in this file
  now need an `octaves: 1` field on every exercise. Keep this case (it still
  holds for one-octave) and add a two-octave case expecting
  `/must have exactly 15 steps, found 14/`.
- **`tests/exercises.test.ts:82`** — `expect(exercise.steps).toHaveLength(8)`
  becomes `expect(exercise.steps).toHaveLength(exercise.octaves * 7 + 1)`.
- **`tests/seed.test.ts`** — any exercise-count assertion goes from 24 to 38.
  Confirm the no-silent-update guard still fires when a two-octave step differs.
- **`tests/migrations.test.ts`** — add a `0008` case modelled on the existing
  `0007` case at line 150: existing exercises backfill to `octaves = 1`; a
  `step_index` of 14 inserts and 15 is rejected; a `semitone_offset` of 24
  inserts and 25 is rejected; `timing_sample_count + timing_excluded_count = 15`
  inserts and 16 is rejected.
- **`tests/api.test.ts:86`** and **`tests/run-result-rows.test.ts:52`** — both
  build 8-step fixtures. Leave them one-octave; just confirm they still pass.

Add new coverage:

- `catalog/v1.ts` produces C major two-octave ascending with fingering
  `[1,2,3,1,2,3,4,1,2,3,1,2,3,4,5]`, offsets
  `[0,2,4,5,7,9,11,12,14,16,17,19,21,23,24]`, and notes
  `C D E F G A B C D E F G A B C`.
- `catalog/v1.ts` produces F major two-octave ascending with fingering
  `[1,2,3,4,1,2,3,1,2,3,4,1,2,3,4]`.
- The catalog contains exactly 38 exercises, and exactly the five black-key
  scales have no two-octave variant.
- `scoreRun` over a 15-step exercise: a perfect run passes, and
  `summary.timingSampleCount` is 15.

---

## Step 9 — Verification

```bash
npm run lint && npm test    # 101 tests pass today; all must stay green
npm run migrate             # applies 0008 to piano.db
npm run seed                # run it TWICE -- the second must be a silent no-op
npm run report:charts       # report 001 rebuilds from its own CSVs, unaffected
```

Then run the app (`npm run dev`), select **C major ascending (2 octaves)**, and
play it — use the computer-keyboard input if no MIDI hardware is attached:

1. Count-in is four beats, and the click continues through all 15 notes with no
   early cut-off and no extra bar. **This is the `Math.ceil` fix; if the click
   stops early or the run never submits, Step 7 is wrong.**
2. The timeline shows 15 pads in a single row, aligned with 15 target circles,
   and the laser reaches the right edge as the last note lands. **Two rows of
   pads means the CSS custom property did not land.**
3. The on-screen keyboard spans three octaves and highlights C up to the C two
   octaves above, labelled `1 2 3 1 2 3 4 1 2 3 1 2 3 4 5`.
4. The run submits: exactly one `POST /api/runs` in the DevTools console, and
   the end-of-round table has 15 rows.
5. Re-select a one-octave exercise and confirm it behaves exactly as before —
   8 pads, 8 rows, same click pattern.

---

## Not in scope

This plan changed no scoring maths when it shipped, so its own migration did
not require re-scoring. `octaves DEFAULT 1` keeps existing runs truthful about
what they were played against.

**Outcome:** the manual C-major two-octave playback check passed. A later,
separate Stage 3 timing decision adopted best-fit-line scoring and re-scored
stored runs with `npm run rescore-assessments`; it is not a consequence of the
two-octave migration.
