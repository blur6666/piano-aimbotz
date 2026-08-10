# BACKLOG.md

## 🏃‍♂️ Active Sprint (Agent Actionable)

- **[TODO]** When the user has the browser in **landscape in fullscreen or maximized mode**, we should consider this viewport as "fullscreen landscape" and then use as much horizontal space as possible. 
  - The keyboard rendered should be 5 octaves + 1 key long = 61 keys. Which is the size of my midi keyboard. The central C is C4 = middle C. 
  - All scales should start as close from middle C as possible when in fullscreen landscape, toi the right or to the left of it, whichever is closest.. 
  - Note that if the user has the tab open in the browser landscape and its not actually fullscreen, it still counts. 
  - BTW, don restrict the page's width to a thin strip as its done with width limited pages that scroll down only. Thats not the case, so use horizontal space.


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
