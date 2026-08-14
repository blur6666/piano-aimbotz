# Piano Scale Trainer — Specification

## Project Context

**This is a hobby project.** Its purposes, in order:

1. Help me practise piano scales. I will actually use this.
2. Give me practice building something with persistence, migrations, tests, and CI — my existing projects are all frontend-only, and this is the gap I'm deliberately closing.
3. Serve as a portfolio piece.

**One user: me.** No multi-tenancy. No auth beyond the bare minimum. No availability requirements, no SLA. If it breaks, I fix it.

**Concept:** `keybr.com`, but for piano scales. Play a scale against a metronome, get measured with mathematical precision, and advance as you build speed and accuracy.

**Why this project:** It's the missing third piece next to two existing tools — `circle-of-fifths` (explore) and `piano-music-theory-sandbox` (identify). This one is _practice_. It is also the first project of mine that genuinely needs persistence: without stored per-step history there is no progression, so the database is an essential core component.

**Document roles:** This file is the source of truth for product intent and scope. `ARCHITECTURE.md` is the source of truth for _how_ — schema, contracts, rationale — once a decision below has been turned into code. `AGENTS.md` is operational (how to run/check). Implementation details belong in `ARCHITECTURE.md`, not duplicated here.

---

## Technical Constraints & Stance

**Do not propose:** microservices, event sourcing frameworks, CQRS, message queues, Kubernetes, service meshes, caching layers, GraphQL federation, DDD aggregates, hexagonal/clean-architecture ceremony, or anything justified by problems this project does not have. Boring technology, one deployable, one SQLite database.

**KISS is an explicit stance:** no resilience layers, no graceful degradation, no edge-case armour. I tinker and fix breakage myself. Where a simple thing and a general thing both work, pick the simple one and write down why.

**Small does not mean careless.** The data model, the migrations, and the tests _are_ the point — they're the skills I'm building and the standard a reviewer would evaluate. Specifically:

- A relational schema whose decisions can be defended in writing
- Real hand-written SQL migrations, including column additions and table alterations
- Tests that encode domain rules, not just HTTP status codes
- CI running those tests automatically on push

**The code is written and reviewed by AI agents against this spec.** Favour explicit contracts, clear module boundaries, and stated invariants over cleverness. Things that must not be rediscovered should be written down plainly.

---

## Product Vision

**It is both a tool and a toy.**

- **As a tool**, it is a guided practice path: start at the easiest scale (C major), practice against a steady beat, and get told objectively when you are ready to advance.
- **As a toy**, guidance is gamified — visible streaks, a climbing tempo, a progression list to master, and immediate feedback on where you were clean and where you stumbled.

**Two tracked dimensions: speed and accuracy.**

- **Speed** is tempo (BPM).
- **Accuracy** is fault counts (hard and soft).
- **Progress in either dimension is gated by the other**: tempo only climbs when runs are consistently clean. A single fast run does not move you forward; three consecutive clean runs do.

---

## Deliverables by Phase

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 1 (v1): The Guided Practice Loop & Persistence (Acceptance Bar)  │
│   • Core Web MIDI & Audio Metronome engine                              │
│   • 12 Major Scales (1 & 2 octaves, ascending & descending)             │
│   • Raw event ingestion & deterministic scoring                         │
│   • 3-streak tempo progression & advisory next-scale recommendation     │
├─────────────────────────────────────────────────────────────────────────┤
│ Phase 2 (v2): Gamified Campaign & Analytical Focus (Direction)          │
│   • Merit-based unlock gates (tuned against real session data)          │
│   • Analytical heatmaps (signed timing deviations, thumb-tuck stumbles) │
│   • Accelerando/ritardando tempo variation                              │
│   • Spaced repetition rotation of mastered scales                       │
├─────────────────────────────────────────────────────────────────────────┤
│ Phase 3 (v3): Interactive Notation & Minor Scales (Specified Extension) │
│   • Real-time interactive staff notation via VexFlow (treble clef)      │
│   • Isolated note-location reading drills                               │
│   • Natural, Harmonic, and Melodic Minor (with asymmetric melodic form) │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 (v1) — The Core Guided Practice Loop

**Acceptance bar:** Every right-hand major scale can be played ascending and descending against the metronome, runs are captured and scored end to end, three consecutive clean runs raise that exercise's tempo, raw events are stored for historical re-scoring, and migrations/tests/CI run green.

### 1. Exercise Shape and Motion

- **Right hand only.**
- **One or two octaves.** Every scale exists at both counts (octave count is selectable).
- **Ascending and descending motion only.** No arpeggios or broken patterns in v1.
- **Ascending and descending are scored separately:** The thumb movement differs (tuck under going up vs. cross over coming down), and player dexterity differs by direction.
- **Fixed tempo per run:** Scored runs happen at the server-owned tempo for that exercise.
- **Fingering source of record:** [`docs/SCALES_FINGERING_REFERENCE.md`](file:///c:/Users/bcint/proj/dev/bakinfernoaimbotz/docs/SCALES_FINGERING_REFERENCE.md). One-octave fingering takes the first 7 fingers, ending on the higher finger of any choice. Descending is the exact reverse of ascending.

### 2. The Metronome and Beat Grid

- Metronome plays a **4-beat count-in**, then continues through the exercise.
- **Beat grids supported:** Straight quarters (`notesPerBeat: 1`) or straight eighths (`notesPerBeat: 2`).
- Because tempo and count-in are known, the beat grid is mathematically exact. Every note's timing deviation is a direct subtraction against that grid, not an inference.

### 3. Practice Mode vs. Scored Mode

- **Scored runs** use the server-held tempo and update progression atomically on completion.
- **Practice mode** allows free tempo selection for warmups or high-tempo experiments. Practice runs are not submitted to the progress table and never advance streaks or tempo.

### 4. Fault Classification and Scoring

**Accuracy is evaluated in discrete fault counts, never a percentage.** A percentage improperly flattens a wrong pitch and a 10ms timing imperfection into the same number.

- **Hard fault (binary, per note):**
  - Wrong pitch (wrong key, missed accidental).
  - Extra note (unintended key strike, duplicate strike, or adjacent key graze).
  - Missed note.
- **Soft fault, type 1 — Timing deviation:**
  - Deviation in microseconds from the expected beat grid.
  - A note is flagged with a timing fault if its absolute deviation exceeds the configured note-fraction tolerance.
- **Soft fault, type 2 — Overlap / Legato bleed:**
  - The previous note is not released before the next sounds.
  - Tracked via `note_off` events to identify finger release technique.
- **Recovery window:** A hard fault does not abort the run. The run continues, but a configured window of notes following the fault is **excluded from timing statistics** so that stumble recovery does not contaminate rhythmic evenness measurements.

### 5. Progression Order & Scale Groups

Scales are ordered by **fingering pattern**, not accidental count, to minimize physical pattern memorization.

- **Group 1 — Shared fingering (`1-2-3-1-2-3-4-5`):** C, G, D, A, E, B.
- **Group 2 — The white-key exception:** F (`1-2-3-4-1-2-3-4`).
- **Group 3 — Black-key scales:** $B\flat, E\flat, A\flat, D\flat, G\flat$.
  - Correct diatonic spellings are strictly maintained (e.g. $G\flat$ major is $G\flat, A\flat, B\flat, C\flat, D\flat, E\flat, F, G\flat$).

### 6. Advancement and Recommendation Rules

- **Exercise Tempo Advancement:** 3 consecutive clean runs (zero hard faults, soft faults under threshold) advance the exercise's tempo by the configured increment (e.g. +4 BPM).
- **Next Scale Recommendation:** The app recommends the first scale that is not yet cleared. A scale is defined as **cleared** when its 1-octave ascending and 1-octave descending exercises have each advanced their tempo at least once beyond the seeded initial tempo.
- **Advisory, Not Locked:** In v1, all scales remain freely selectable. Recommendations are advisory badges, not access gates.

### 7. Data Persistence Philosophy

- **Store raw MIDI events:** Sequence number, offset in microseconds, message type (`note_on`/`note_off`), MIDI pitch, and velocity are stored in append-only tables.
- **Derived read models:** `run_assessments` and `exercise_progress` are derived from raw events and can be rebuilt or rescored at any time.

---

## Phase 2 (v2) — Gamified Campaign & Analytics (Direction)

Directional features to be designed and tuned once real session data exists in `piano.db`:

1. **Merit-Based Campaign Trail:**
   - Turning the advisory scale recommendation into a structured campaign path.
   - Progression groups become "worlds", scales become "nodes", and nodes unlock only upon clearing requirements.
2. **Analytical Practice Focus:**
   - Signed timing deviation analysis (e.g. identifying systematic rushing on specific fingers or thumb-tucks).
   - Error heatmaps comparing multiple runs over time.
3. **Dynamic Tempo Variation:**
   - Exercises with accelerando (speeding up) and ritardando (slowing down) within a single run.
4. **Spaced Rotation:**
   - Automatically re-introducing mastered scales into daily practice loops.

---

## Phase 3 (v3) — Interactive Notation & Minor Scales

### 1. Interactive Score (Sheet Music Rendering)

- **Engine:** VexFlow rendering directly onto a canvas/SVG above the keyboard.
- **Treble Clef Only:** Right-hand v1 exercises reside on the treble staff.
- **True Diatonic Key Signatures:** Proper key signatures generated from scale definitions.
- **Live Real-Time Note Feedback:** Notes played during the run are marked dynamically on the staff.

### 2. Note-Location Reading Drills

- Standalone flashcard-style note identification drills.
- Completely decoupled from timed scale run tables to preserve database schema integrity.

### 3. Minor Scales (Seeded Catalog Extension)

- **Natural, Harmonic, and Melodic Minor** for all 12 keys.
- **Melodic Minor Asymmetry:** Ascends with raised 6th and 7th degrees, descends as natural minor. (Descending exercise is distinct from the reverse of ascending notes, while fingerings reverse symmetrically).
- **Fingering Provenance:** All fingerings sourced strictly from `docs/SCALES_FINGERING_REFERENCE.md`.

---

## Out of Scope & Non-Goals

- Two-handed practice or left-hand exercises (deferred to future major versions).
- Arbitrary polyphonic piece playback or MIDI file importing.
- Multi-user authentication or cloud database sync.
- Synthesized or invented fingerings not grounded in the reference chart.
