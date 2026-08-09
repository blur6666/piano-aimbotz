# BACKLOG.md

## 🏃‍♂️ Active Sprint (Agent Actionable)

- **[TODO] Support scales longer than one octave (2-octave C major and beyond)**
  - _Why:_ blocks recording a 2-octave practice session at all. Also the
    better experiment for report 001's finding: 2-octave C major ascending is
    fingered `1 2 3 1 2 3 4 1 2 3 1 2 3 4 5`, which contains **three** thumb
    crossings instead of one, so it tests whether the approach-drag recurs at
    every crossing and whether the B→C crossing (thumb after finger 4) behaves
    like the E→F ones (thumb after finger 3).
  - _Blockers — three CHECK constraints assume exactly 8 steps in one octave:_
    - `exercise_steps.step_index CHECK (step_index BETWEEN 0 AND 7)`
    - `exercise_steps.semitone_offset CHECK (BETWEEN -12 AND 12)` — 2 octaves
      needs +24
    - `run_assessments CHECK (timing_sample_count + timing_excluded_count <= 8)`
  - _Also touches:_ the catalog (`catalog/v1.ts`, `src/domain/catalog/`) which
    seeds 8 steps per exercise; `scoreRun`, which is step-count agnostic but
    whose callers and tests are not; and the practice UI timeline/keyboard,
    which lays out a fixed 8 notes.
  - _Sequencing note:_ this lands in the same scoring path as report 001's
    "score against a best-fit line" recommendation. Worth deciding whether
    they ship together, since both re-score stored runs.

- **[TODO] Correct the expected beat grid for audio output latency**
  - _Why:_ measured across 21 real runs, every step was late by a mean of
    +46 ms, and `AudioContext.outputLatency` on this machine reads 42 ms
    (`playbackStats.averageLatency` 43 ms). The two agree within ~3 ms, so
    essentially all of the apparent lateness is the click reaching the ears
    later than we timestamp it. Deviations relative to the player's own mean
    are only ±23 ms — the unevenness is fine, the anchor is wrong. Every run
    recorded before this lands carries a ~43 ms handicap.
  - _Do not_ read `outputLatency` from a freshly created `AudioContext`: it
    reports 0 until the device is actually rendering. Measure it at the
    **end** of the run, when the context has been clicking for seconds.
  - _Plan:_ migration `0008` adds `output_latency_us` to `runs` (DEFAULT 0,
    so the existing 21 runs stay honest about having been uncorrected);
    `SubmitRun` carries the measured value; `scoreRun` adds it to every
    `expectedOffsetUs`. Stored per run rather than configured globally,
    for the same reason as `notes_per_beat` — it is a property of the
    conditions a run was played under, so swapping audio devices later
    does not retro-fit today's number onto old runs. Raw events are
    untouched, so all existing runs re-score for free.
  - _Consequence:_ with 43 ms removed, most of the 21 recorded runs flip to
    passing, including the 88 BPM ones. Expect the tempo ceiling to jump;
    consider resetting the climb rather than inheriting it.

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
