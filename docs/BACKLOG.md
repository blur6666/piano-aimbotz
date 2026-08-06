# BACKLOG.md

## 🏃‍♂️ Active Sprint (Agent Actionable)

- **[TODO] Add human voice sample saying 1, 2, 3, 4 in the metronome count-in.**
- **[TODO] Add an option to toggle to autorestart, it will trigger the count-in and then its on again, as long as you can!**
- **[TODO] Add a keybind to stop** (if rolling) and also to restart from the count-in
  - Will require the human voice "1 2 3 4" count-in 

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

- **[TODO] Silence the metronome's trailing click**
  - The extra beat after the final note is deliberate — it holds the capture
    window open so the last note-off is recorded (`runExercise.ts`). It just
    should not be audible. Schedule the tail beat without the click.

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
