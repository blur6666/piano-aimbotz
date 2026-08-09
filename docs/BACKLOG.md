# BACKLOG.md

## 🏃‍♂️ Active Sprint (Agent Actionable)

- **[VERIFYING] Two-octave scales — implemented, awaiting the playback check**
  - _Shipped:_ `9982895`, for Group 1 plus F (seven scales), following
    [`docs/plans/two-octave-scales.md`](plans/two-octave-scales.md). Migration
    `0008` widened the three CHECK constraints that capped an exercise at eight
    steps; the catalog validator and the wire contract were the other two
    places assuming the same thing.
  - _What is left:_ play **C major ascending (2 octaves)** and check three
    things no test can see — that the click runs to the end of all fifteen
    notes rather than stopping at 7.5 beats, that the timeline pads sit in one
    row aligned with their targets, and that the keyboard highlights the full
    span up to the C two octaves above. Then trim this item out.
  - _Why it mattered:_ this is the better experiment for report 001's finding.
    2-octave C major ascending is fingered `1 2 3 1 2 3 4 1 2 3 1 2 3 4 5`,
    which contains **three** thumb crossings instead of one, so it tests
    whether the approach-drag recurs at every crossing and whether the B→C
    crossing (thumb after finger 4) behaves like the E→F ones (thumb after
    finger 3).
  - _Still open:_ the five black-key scales stay one octave until their
    two-octave fingering is sourced from the pianoscales.org reference. Their
    one-octave patterns do not start on the thumb, so the octave repeat used
    for the other seven is not valid for them and the data cannot be derived.

- **[TODO] Settle the timing anchor: measured latency, best-fit line, or neither**
  - _Status:_ this replaces a prescriptive item that specified a migration and a
    formula. [Report 001](../reports/001-midi-latency/REPORT.md) was written
    afterwards and contradicts it, so the work now is to settle the
    disagreement, not to implement either side. The relevant sections there are
    *The offset is not constant* and *Recommendations*.
  - _The case for correcting:_ across 21 real runs every step was late by a mean
    of +46 ms, and `AudioContext.outputLatency` on this machine reads 42 ms
    (`playbackStats.averageLatency` 43 ms). The two agree within ~3 ms. The
    delay between when we timestamp the click and when it reaches the ears is
    physical, and correcting for it is defensible on those grounds alone.
  - _The case against:_ report 001 rec #2. The offset resets to ~78–81 ms every
    time the tempo changes and decays ~3.9 ms per attempt (r = −0.56) — fixed
    hardware latency cannot produce a reset on tempo change. A flat correction
    therefore overcorrects settled runs: run 5 passes today and *gains* a fault
    under flat −45 ms compensation.
  - _The unresolved part:_ the 84 bpm block settles to a 2 ms offset. If a
    genuine ~42 ms output latency were being subtracted, those runs would land
    near −40 ms and fail. Either the player anticipates the click, or the
    measured latency is not what reaches the ears. This dataset cannot separate
    MIDI device latency, audio output latency and human reaction lag — report
    001 says so in its own caveat.
  - _The alternative:_ report 001 rec #1 — score against each run's own best-fit
    line instead of the absolute grid. Takes passing runs from 9 to 20 and
    faulted notes from 35 to 1, needs no latency assumption at all, and still
    measures evenness, which is the quantity of interest. Report 001 calls it
    the highest-value change in it.
  - _What would settle it:_ report 001 rec #7 — capture a reference run with
    known device latency. A loopback or click-track measurement that isolates
    device latency from human reaction lag is the missing evidence. Until that
    exists this is a question, not a task.
  - _Do not_ read `outputLatency` from a freshly created `AudioContext`: it
    reports 0 until the device is actually rendering. Measure it at the
    **end** of a run, when the context has been clicking for seconds. True
    whichever way the decision goes.
  - _Consequence either way:_ every run recorded so far was scored against the
    uncorrected grid, so any change here re-scores stored runs. Re-score and
    rebuild progress with `rebuildExerciseProgress`
    (`src/server/progress/rebuild.ts`, `npm run rebuild-progress`) rather than
    leaving old assessments as-is. Expect the tempo ceiling to jump; consider
    resetting the climb rather than inheriting it.

---

## ❓ Clarification Needed (Human to define before agent execution)

- **[CLARIFICATION] Extra-note debounce**
  - _Note:_ Deferred until real data exists. Needs re-evaluation.
- **[CLARIFICATION] createRun reads inside the transaction**
  - _Note:_ Needs to match `ARCHITECTURE.md` wording.
- **[CLARIFICATION] Doc fixes**
  - _Note:_ Address startup backfill note, repo-layout drift (`tests/fixtures/`, `tests/integration/` listed but absent — `catalog/` and `src/domain/catalog/` now exist for real).

---

## 🧊 Icebox (Not Doing Now)

- **[SKIPPED] Real tolerance/gate values**
  - `.env.example` values are explicitly "examples, not recommendations"; tune from real sessions. We won't do this now.
