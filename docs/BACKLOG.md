# BACKLOG.md

- **[TODO] Show notes played by the MIDI piano**
  - Display onscreen the notes played by the MIDI piano even when no exercise is running.

- **[TODO] Manual BPM selection shouldn't count as progress**
  - When the user manually selects the BPM in the field on the page, it shouldn't be counted as progress.
  - There should be a button "I'm just testing the app" that ignores the results (maybe flagging instead of discarding).

## ❓ Clarification Needed (Human to define before agent execution)

- **[CLARIFICATION] Extra-note debounce**
  - _Note:_ Deferred until real data exists. Needs re-evaluation.
- **[CLARIFICATION] createRun reads inside the transaction**
  - _Note:_ `createRun` (`src/server/runs/create-run.ts`) reads the exercise and
    progress rows and calls `scoreRun` _before_ opening the
    `sqlite.transaction(...)` block, not inside it. `better-sqlite3` is
    synchronous so there is no real race, but it does not match
    `docs/ARCHITECTURE.md`'s "loads the exercise and progress rows... inside" one
    transaction. Moving the reads into the transaction callback would match the
    doc exactly, at the cost of a slightly larger callback. Not urgent.
- **[CLARIFICATION] Doc fixes**
  - _Note:_ Startup backfill — legacy-assessment backfill
    (`src/server/db/backfill-assessments.ts`) now runs on every server startup,
    with each backfilled run in its own transaction rather than one transaction
    for the batch. Safe, but it turns "startup runs migrations only" into
    "startup runs migrations, then repairs any legacy data"; worth a line in
    `docs/ARCHITECTURE.md`'s deployment section.
  - _Note:_ Repo-layout drift (`tests/fixtures/`, `tests/integration/` listed but absent — `catalog/` and `src/domain/catalog/` now exist for real).

---

## 🧊 Icebox (Not Doing Now)

- **[SKIPPED] Real tolerance/gate values**
  - `.env.example` values are explicitly "examples, not recommendations"; tune from real sessions. We won't do this now.
