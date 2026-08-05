# BACKLOG.md

## 🏃‍♂️ Active Sprint (Agent Actionable)

*   **[DONE] Priority 1: Structural Debt Kill (Drizzle & countHardFaults)**
    *   Delete `schema.ts`, `openDatabase()`, and drizzle deps.
    *   Document hand-written SQL (currently has drifted and misleads). Update `ARCHITECTURE.md` which incorrectly claims Drizzle is the query layer.
    *   Delete `countHardFaults` shim and port 3 Stage 1 tests to `scoreRun`.
*   **[DONE] Priority 2 (Impl #1): Descending Exercises**
    *   Seed C major descending (schema 0004/0005 and scorer are ready). Fingering is the reverse of known ascending; no new data needed.
*   **[DONE] Priority 3 (Impl #2): Client Exercise Selection**
    *   Update client to allow user choice instead of auto-picking `exercises[0]`.
    *   Update `GET /api/exercises` to return the `groups→scales→exercises` contract instead of a flat list.
*   **[DONE] Priority 4 (Impl #3): History UI**
    *   Update client to display history using existing server endpoints (`GET /api/runs?exerciseId` and `GET /api/runs/:id`).
*   **[DONE] Priority 5: Failed-Run Behavior**
    *   Implement basic print/display for `reset_streak` vs `step_down` without fancy styling (temporary placement).
*   **[DONE] Priority 6: Client Test Infrastructure**
    *   Implement capture tests (velocity-zero normalization, fake clock, request shape) as required by `ARCHITECTURE`.
*   **[DONE] Priority 7: Manual Hardware Acceptance Checklist**
    *   Create the checklist file mentioned in `ARCHITECTURE`. See `MANUAL_ACCEPTANCE_CHECKLIST.md`.
*   **[DONE] Converge test schemas**
    *   *Note:* Converge `tests/api.test.ts` + `tests/backfill.test.ts` on `applyMigrations` instead of hand-rolled schemas.

---

## ✋ Blocked / Needs Human Action

*   **[DONE] Full 12-scale / 24-exercise catalog**
    *   `progression_groups` + `scales` tables added (migration `0006_progression_catalog.sql`).
    *   Flat exercises table restructured to `scale_id+direction` per `ARCHITECTURE.md`.
    *   Seed validator added at `src/domain/catalog`.
    *   Versioned catalog data file with provenance added at `catalog/v1.ts` (see `catalog/README.md`).
*   **[DONE] Priority 8: Fingering Dataset Extraction**
    *   Extracted black-key scale data from `tmp-fingering-reference-for-major-scales.png` (pianoscales.org), cross-checked against `major-minor-scales-fingerings.tsv`. E♭/B♭ conflict resolved in favor of pianoscales.org (per human decision); A♭ conflict resolved in favor of the TSV (per human decision). Full reconciliation in `catalog/README.md`.

---

## ❓ Clarification Needed (Human to define before agent execution)

*   **[CLARIFICATION] Extra-note debounce**
    *   *Note:* Deferred until real data exists. Needs re-evaluation.
*   **[DONE] readRun undefined guard**
    *   *Note:* One-line explicit check added; missing `run_assessments` now throws a clear internal error instead of a raw `TypeError`. See `tests/error-handling.test.ts`.
*   **[CLARIFICATION] createRun reads inside the transaction**
    *   *Note:* Needs to match `ARCHITECTURE.md` wording.
*   **[CLARIFICATION] Doc fixes**
    *   *Note:* Address startup backfill note, repo-layout drift (`tests/fixtures/`, `tests/integration/` listed but absent — `catalog/` and `src/domain/catalog/` now exist for real).
*   **[DONE] Stage 2 scoring tests**
    *   *Note:* All 11 gaps covered in `tests/scoring.test.ts` (pre-anchor wrong pitch, wrong octave post-anchor, resync/missed, post-step-7 extras, fault attribution sums, tie-break ordering, timing boundaries, exclusion window, overlap cases, velocity no-op, passed gates).

---

## 🧊 Icebox (Not Doing Now)

*   **[SKIPPED] Real tolerance/gate values**
    *   `.env.example` values are explicitly "examples, not recommendations"; tune from real sessions. We won't do this now.