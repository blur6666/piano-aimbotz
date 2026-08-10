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
  - _Note:_ Needs to match `ARCHITECTURE.md` wording.
- **[CLARIFICATION] Doc fixes**
  - _Note:_ Address startup backfill note, repo-layout drift (`tests/fixtures/`, `tests/integration/` listed but absent — `catalog/` and `src/domain/catalog/` now exist for real).

---

## 🧊 Icebox (Not Doing Now)

- **[SKIPPED] Real tolerance/gate values**
  - `.env.example` values are explicitly "examples, not recommendations"; tune from real sessions. We won't do this now.
