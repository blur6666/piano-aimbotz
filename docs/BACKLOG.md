# Project Backlog

Tasks derived directly from [`docs/SPEC.md`](file:///c:/Users/bcint/proj/dev/bakinfernoaimbotz/docs/SPEC.md) and [`docs/ARCHITECTURE.md`](file:///c:/Users/bcint/proj/dev/bakinfernoaimbotz/docs/ARCHITECTURE.md).

---

## 🎯 Active / Immediate: Phase 1 (v1) Polish & Core UX

- [x] **[P1-UX] Show live notes played on virtual keyboard when idle**
  - Mirror MIDI keypresses and releases on the on-screen virtual keyboard even when no exercise is currently running.
  - Helps the player test their MIDI connection and verify pitch alignment before starting a count-in.

- [x] **[P1-CORE] Enforce Practice Mode / Manual BPM Progress Isolation**
  - When the user manually changes tempo or enters Practice Mode, runs must **not** submit scored results or advance progression streaks.
  - Provide a clear UI toggle/indicator ("Practice Mode / Sandbox") so testing and warmups never accidentally mutate server progression data.

- [ ] **[P1-TECH] Move `createRun` entity reads inside database transaction**
  - Align [`src/server/runs/create-run.ts`](file:///c:/Users/bcint/proj/dev/bakinfernoaimbotz/src/server/runs/create-run.ts) with [`docs/ARCHITECTURE.md`](file:///c:/Users/bcint/proj/dev/bakinfernoaimbotz/docs/ARCHITECTURE.md) by moving the initial `exercises` and `exercise_progress` queries inside the synchronous SQLite transaction block.

---

## 🎼 Phase 3 (v3): Interactive Notation & Minor Scales

### Milestone 3.1 — Interactive Sheet Music Staff (VexFlow)

- [x] **[V3-SCORE-1] Render exercise notation with VexFlow**
  - Draw a treble clef staff directly above the virtual keyboard for the active exercise.
  - Dynamically compute correct diatonic key signatures based on the selected scale rather than scattering individual accidentals.
- [x] **[V3-SCORE-2] Real-time note strike feedback on staff**
  - Visually highlight notes on the VexFlow staff as they are struck during a run, matching the approximate browser timeline timing before final server assessment arrives.

### Milestone 3.2 — Minor Scales Catalog Extension

- [ ] **[V3-MINOR-1] Catalog and Migration for Natural, Harmonic & Melodic Minor**
  - Add migrations and seed entries for Natural, Harmonic, and Melodic Minor across all 12 keys, sourced directly from [`docs/SCALES_FINGERING_REFERENCE.md`](file:///c:/Users/bcint/proj/dev/bakinfernoaimbotz/docs/SCALES_FINGERING_REFERENCE.md).
- [ ] **[V3-MINOR-2] Melodic Minor Asymmetry Support**
  - Update domain validation and exercise generator to support melodic minor's asymmetric nature (ascending with raised 6th/7th degrees, descending as natural minor) while maintaining symmetric fingering reversal.
- [ ] **[V3-MINOR-3] Minor Progression Groups & World Ordering**
  - Group minor scales logically by shared fingering patterns as defined in the fingering reference, appending them as new progression groups after the major scales.

### Milestone 3.3 — Note-Location Reading Drills

- [ ] **[V3-DRILL] Standalone Note Identification Drills**
  - Build flashcard-style treble clef reading rounds.
  - Keep drill storage isolated from the timed scale run tables to maintain data model purity.

---

## 📊 Phase 2 (v2): Gamified Campaign & Analytics (Data-Driven / Icebox)

_These tasks depend on collecting real session data in `piano.db` before final tuning._

- [ ] **[V2-ANALYTICS] Signed Timing Deviation Analysis & Thumb-Tuck Heatmaps**
  - Replay raw `midi_events` to identify systematic rushing, dragging, or finger-specific stumbles (e.g. Group 1 thumb tucks).
- [ ] **[V2-CAMPAIGN] Structured World/Node Campaign Unlock Trail**
  - Transition advisory next-scale recommendations into formal unlock gates once mastery thresholds are mathematically validated.
- [ ] **[V2-TEMPO] Dynamic Accelerando / Ritardando Exercises**
  - Support tempo changes within a single exercise run.
- [ ] **[V2-ROTATION] Spaced Repetition Scale Review**
  - Automatically re-introduce previously cleared scales into active practice queues.

---

## ❓ Clarifications & Architectural Notes

- **[CLARIFICATION] Extra-note debounce**
  - Deferred until real session data demonstrates whether adjacent key grazes feel overly punishing in practice.
- **[DOCS] Documentation Synchronization**
  - Keep `docs/ARCHITECTURE.md` and `AGENTS.md` aligned with startup backfill behavior and new migration milestones.
