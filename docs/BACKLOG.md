# BACKLOG.md

## 🏃‍♂️ Active Sprint (Agent Actionable)

No active items.

## Completed

- **Two-octave scales:** C-major ascending playback passed all manual checks:
  the click reaches all 15 notes, timeline targets align, and the three-octave
  reference keyboard highlights the intended two-octave C-to-C span. Group 1
  plus F remain supported; black-key two-octave fingerings still need sources.
- **Timing reference:** Stage 3 scores residual unevenness against each run's
  best-fit line, reports the fitted start offset separately, and does not apply
  a guessed audio or BLE MIDI latency correction. Existing runs are explicitly
  re-scored with `npm run rescore-assessments`, which also rebuilds progress.
- **Catalog refactor:** `docs/major-minor-fingering.md` is now the sole RH
  fingering reference; `catalog/v1.ts` is a compact dict with the provenance
  prose stripped. Per the reference, E-flat major ascending starts on finger
  3; migration `0010` corrects the two stored E-flat cells.

---

## ❓ Clarification Needed (Human to define before agent execution)

- **[CLARIFICATION] Extra-note debounce**
  - _Note:_ Deferred until real data exists. Needs re-evaluation.
- **[CLARIFICATION] createRun reads inside the transaction**
  - _Note:_ `createRun` (`src/server/runs/create-run.ts`) reads the exercise and
    progress rows and calls `scoreRun` _before_ opening the
    `sqlite.transaction(...)` block, not inside it. `better-sqlite3` is
    synchronous so there is no real race, but it does not match
    `ARCHITECTURE.md`'s "loads the exercise and progress rows... inside" one
    transaction. Moving the reads into the transaction callback would match the
    doc exactly, at the cost of a slightly larger callback. Not urgent.
- **[CLARIFICATION] Doc fixes**
  - _Note:_ Startup backfill — legacy-assessment backfill
    (`src/server/db/backfill-assessments.ts`) now runs on every server startup,
    with each backfilled run in its own transaction rather than one transaction
    for the batch. Safe, but it turns "startup runs migrations only" into
    "startup runs migrations, then repairs any legacy data"; worth a line in
    `ARCHITECTURE.md`'s deployment section.
  - _Note:_ Repo-layout drift (`tests/fixtures/`, `tests/integration/` listed but absent — `catalog/` and `src/domain/catalog/` now exist for real).

---

## 🧊 Icebox (Not Doing Now)

- **[SKIPPED] Real tolerance/gate values**
  - `.env.example` values are explicitly "examples, not recommendations"; tune from real sessions. We won't do this now.
