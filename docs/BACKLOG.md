# BACKLOG.md

## 🏃‍♂️ Active Sprint (Agent Actionable)

- **[DONE] Priority 1: Structural Debt Kill (Drizzle & countHardFaults)**
  - Delete `schema.ts`, `openDatabase()`, and drizzle deps.
  - Document hand-written SQL (currently has drifted and misleads). Update `ARCHITECTURE.md` which incorrectly claims Drizzle is the query layer.
  - Delete `countHardFaults` shim and port 3 Stage 1 tests to `scoreRun`.
- **[DONE] Priority 2 (Impl #1): Descending Exercises**
  - Seed C major descending (schema 0004/0005 and scorer are ready). Fingering is the reverse of known ascending; no new data needed.
- **[DONE] Priority 3 (Impl #2): Client Exercise Selection**
  - Update client to allow user choice instead of auto-picking `exercises[0]`.
  - Update `GET /api/exercises` to return the `groups→scales→exercises` contract instead of a flat list.
- **[DONE] Priority 4 (Impl #3): History UI**
  - Update client to display history using existing server endpoints (`GET /api/runs?exerciseId` and `GET /api/runs/:id`).
- **[DONE] Priority 5: Failed-Run Behavior**
  - Implement basic print/display for `reset_streak` vs `step_down` without fancy styling (temporary placement).
- **[DONE] Priority 6: Client Test Infrastructure**
  - Implement capture tests (velocity-zero normalization, fake clock, request shape) as required by `ARCHITECTURE`.
- **[DONE] Priority 7: Manual Hardware Acceptance Checklist**
  - Create the checklist file mentioned in `ARCHITECTURE`. See `docs/MANUAL_ACCEPTANCE_CHECKLIST.md`.
- **[DONE] Converge test schemas**
  - _Note:_ Converge `tests/api.test.ts` + `tests/backfill.test.ts` on `applyMigrations` instead of hand-rolled schemas.
- **[DONE] No real output about your performance**
  - _Note:_ `runExercise.ts` now prints a per-note console report (hit/miss, timing deviation, "Perfect! (<5ms)", hard-fault/timing-exclusion flags) plus notes-hit/missed/hard-fault/timing-fault/overlap-fault/mean-deviation/passed totals after every attempt. Every point/penalty value is an explicit `[PLACEHOLDER -- scoring formula not decided]` string rather than an invented number — the real scoring formula is still undecided (per the original note), so real figures (`scoreRun`'s hit/miss/deviation/fault counts) are shown as-is and placeholder figures are unmistakably marked as such. `SubmitRunResponse` widened to carry the full per-step assessment the server already sent but the client type didn't expose.
- **[DONE] Draw a time line showing visually in real time the hits on the keys and their timings**
  - _Note:_ New `Timeline` component (`src/client/practice/Timeline.tsx`): 8 note pads spread across a strip, pad center = perfect timing. A laser sweeps left-to-right in real time via `requestAnimationFrame`, synced to the same `performance.now()`-relative clock `capture.ts` already uses (`onScheduled` callback added to `runExercise`). Live note-on events render as approximate markers while the run is in progress (`onLiveNote` callback added to `startCapture`/`runExercise`) — as expected, live audio/visual sync is approximate. Once the server's real response comes back, the accurate per-step timing (`originalAssessment.steps`, already surfaced by the console-report change above) replaces the live markers with the true anchored/matched positions, so the final picture is always correct even if the live one wasn't.
- **[DONE] The timeline worked great! Add a circle outline in the center of the square to symbolize where you should hit the key**
  - _Note:_ `.timeline-target` ring rendered at each pad's center (the perfect-timing position). Hit/miss/live markers are now plain colored circles with no text inside (note name still available via the `title` tooltip on hover).
- **[DONE] hide most of the keys in the drop down.**
  - _Note:_ Dropdown filtered to C/F/G major (`VISIBLE_SCALE_SLUGS` in `main.tsx`) — the rest of the seeded 12-scale catalog is untouched, just hidden from this list. "Current max BPM" and "Streak" moved out of the dropdown label into their own `.stats-row`, side by side with a new "Unlocked BPM (testing)" toggle.
  - "Current max BPM" is `exercise.currentTempoBpm` labeled for what it actually is server-side (no separate historical-max field exists; under the configured `reset_streak` policy this never decreases, so the label holds — would need a real "highest ever" field server-side to stay accurate under `step_down`).
  - Unlocked BPM: a practice-only mode (see `runExercise`'s new `skipSubmit` option) — runs the metronome/capture/timeline at any tempo you type, but never calls `POST /api/runs`. Deliberately does not bypass the server's tempo lock (an ARCHITECTURE.md invariant); it just never submits an off-tempo run in the first place.
- **[DONE] Remove midi connection and device select from the main container**
  - _Note:_ Moved into their own small `.panel.setup` section above the practice panel, visually de-emphasized (lower opacity, tighter padding) since they're one-time setup, not part of the per-run loop.
- **[DONE] When the user selects the key he will practice, show the keyboard with octave with the notes of the scale highlighted**
  - _Note:_ New `Keyboard` component (`src/client/practice/Keyboard.tsx`) + `noteNames.ts` (note-spelling → pitch-class lookup, client-side presentation only). "Show keyboard during test" checkbox controls visibility while a run is active; always shown when idle and an exercise is selected.
- **[DONE] Increase test size of the finger number of each note**
  - _Note:_ `.note span` font-size 13px → 22px.
- **[DONE] Create a script on package.json to run at once everything necessary to view/test new features.**
  - _Note:_ Added `npm run try` = `migrate && seed && start` — one process serving the compiled client + API, matching the documented production topology (`AGENTS.md`). No new dependency needed since `start` already builds first.
- **[DONE] If possible, keep the midi devices connected on reload (f5)**
  - _Note:_ Once Web MIDI permission is granted, `requestMIDIAccess()` resolves silently on later calls (no re-prompt) — `main.tsx` now calls it automatically on mount, and the previously selected device ID persists in `localStorage` (`piano-aimbotz:selectedMidiInputId`) so the same input is reselected without user action. Falls back to the first available device if the saved one is gone; stays quiet (no error shown) if permission isn't granted yet or MIDI is unsupported, since this is a background best-effort reconnect, not a user-initiated action — the "Connect MIDI" button remains the explicit first-time path and still surfaces real errors.
- **[DONE] Make it possible to also input the scale with the computer keyboard.**
  - _Note:_ New `src/client/midi/keyboardInput.ts`: A S D F G H J K = white keys C4-C5, W E T Y U = black keys on the row above (C# D# F# G# A#), matching the requested layout exactly. Emits the same message shape real Web MIDI does, so it's a drop-in `MIDIInput` alternative — `startCapture`/`runExercise`/scoring/timeline are all unchanged and unaware of the difference. Selectable as "Computer keyboard (A-K)", always present in the device dropdown even with zero real MIDI devices connected.




## ✋ Blocked / Needs Human Action

- **[DONE] Full 12-scale / 24-exercise catalog**
  - `progression_groups` + `scales` tables added (migration `0006_progression_catalog.sql`).
  - Flat exercises table restructured to `scale_id+direction` per `ARCHITECTURE.md`.
  - Seed validator added at `src/domain/catalog`.
  - Versioned catalog data file with provenance added at `catalog/v1.ts` (see `catalog/README.md`).
- **[DONE] Priority 8: Fingering Dataset Extraction**
  - Extracted black-key scale data from `catalog/fingering-reference-pianoscales-org.png` (pianoscales.org), cross-checked against `catalog/major-minor-scales-fingerings.tsv`. E♭/B♭ conflict resolved in favor of pianoscales.org (per human decision); A♭ conflict resolved in favor of the TSV (per human decision). Full reconciliation in `catalog/README.md`.

---

## ❓ Clarification Needed (Human to define before agent execution)

- **[CLARIFICATION] Extra-note debounce**
  - _Note:_ Deferred until real data exists. Needs re-evaluation.
- **[DONE] readRun undefined guard**
  - _Note:_ One-line explicit check added; missing `run_assessments` now throws a clear internal error instead of a raw `TypeError`. See `tests/error-handling.test.ts`.
- **[CLARIFICATION] createRun reads inside the transaction**
  - _Note:_ Needs to match `ARCHITECTURE.md` wording.
- **[CLARIFICATION] Doc fixes**
  - _Note:_ Address startup backfill note, repo-layout drift (`tests/fixtures/`, `tests/integration/` listed but absent — `catalog/` and `src/domain/catalog/` now exist for real).
- **[DONE] Stage 2 scoring tests**
  - _Note:_ All 11 gaps covered in `tests/scoring.test.ts` (pre-anchor wrong pitch, wrong octave post-anchor, resync/missed, post-step-7 extras, fault attribution sums, tie-break ordering, timing boundaries, exclusion window, overlap cases, velocity no-op, passed gates).

---

## 🧊 Icebox (Not Doing Now)

- **[SKIPPED] Real tolerance/gate values**
  - `.env.example` values are explicitly "examples, not recommendations"; tune from real sessions. We won't do this now.
