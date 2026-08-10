# Agent and contributor guide

This file orients AI coding agents (and human contributors) working in this
repo. Read `SPEC.md` (product intent, scope) and `ARCHITECTURE.md`
(implementation decisions, invariants) first — they are the sources of
truth. This file is operational: how to run things, and what's known to
still be missing.

## Setup

```bash
npm install
cp .env.example .env   # edit values if you want different tolerances/tempo
npm run migrate
npm run seed
```

## Running

- `npm run dev` + `npm run dev:client` (two terminals) — backend on
  `:3000`, Vite dev server with HMR on `:5173`, proxying `/api` to `:3000`.
- `npm run start` — builds and runs the compiled server as one process on
  `:3000` (matches the production topology).

## Checks

Run all of these before considering a change done:

```bash
npm run typecheck
npm run lint
npm run format:check   # npx prettier --write <files> to fix
npm test                # npm run test:coverage for coverage
npm run build
```

`.github/workflows/ci.yml` runs all of the above, plus migrate+seed against
a temporary database.

## Invariants worth restating

The full list lives in `ARCHITECTURE.md`'s "Invariants that must not be
rediscovered" section — read that before touching scoring, progression, or
the database schema. A few that are easy to violate by accident:

- One user, one process, one SQLite file. No microservices, queues, CQRS,
  or other architecture ceremony without a concrete new requirement.
- `src/domain/scoring.ts` and `src/domain/progression/` are pure and
  deterministic — no Fastify, Drizzle, filesystem, or clock dependency.
- Every persisted run must have exactly one `run_assessments` row. If you
  find one without, backfill it (`npm run backfill-assessments`) rather
  than teaching readers to tolerate a missing assessment.
- `exercise_progress` is a rebuildable snapshot: it must always equal
  replaying `run_assessments` in `run_id` order from `initial_tempo_bpm`.
  `npm run rebuild-progress` does this.
- Migrations are tracked in `schema_migrations`
  (`src/server/db/apply-migrations.ts`) and apply exactly once each. Don't
  assume `CREATE TABLE IF NOT EXISTS`-style idempotency is enough once a
  migration does something non-idempotent (`ALTER TABLE ... DROP COLUMN`,
  a table rebuild).
- Fingering data for all twelve scales is resolved with provenance in
  `docs/major-minor-fingering.md` (right-hand major table — the sole
  reference). One-octave fingerings are the first seven fingers ending on
  the higher finger of any "X/Y" choice; descending is the exact reverse of
  ascending. Do not invent fingerings or provenance; change `catalog/v1.ts`
  only from that reference.

## Known gaps / TODO

**Full catalog: done.** All twelve scales (38 exercises: 24 one-octave plus
14 two-octave for the seven sourced scales) are seeded via
`progression_groups`/`scales` tables (migrations `0006`/`0008`) and validated by
`src/domain/catalog` before insertion (`catalog/v1.ts`).
`exercises.direction` accepts `'descending'` (migration `0004`),
`exercise_steps.semitone_offset` accepts the full `-12..12` range a
descending exercise needs (migration `0005`), and `scoreRun` handles
descending correctly (see the descending test in `tests/scoring.test.ts`).
Descending fingering for every scale is the reverse of its ascending
fingering, derived mechanically rather than sourced separately.

**Minor cleanups**, none urgent:
  - `createRun` (`src/server/runs/create-run.ts`) reads the exercise/
    progress rows and calls `scoreRun` *before* opening the
    `sqlite.transaction(...)` block, not inside it. `better-sqlite3` is
    synchronous so there's no real race, but it doesn't match
    ARCHITECTURE.md's "loads the exercise and progress rows... inside" one
    transaction. Moving the reads inside the transaction callback would
    match the doc exactly, at the cost of a slightly larger callback.
  - Legacy-assessment backfill (`src/server/db/backfill-assessments.ts`)
    now runs on every server startup, and each backfilled run is its own
    transaction (not one transaction for the whole batch). This is safe
    but changes "startup runs migrations only" into "startup runs
    migrations, then repairs any legacy data" — worth a line in
    `ARCHITECTURE.md`'s deployment section if that doc is revisited.

**Scoring test coverage: done.** `scoreRun` (`src/domain/scoring.ts`)
is now covered for wrong-pitch note-ons before the tonic anchors, a
wrong-octave note after anchoring, resynchronization (a later expected
pitch skips ahead, marking the skipped steps `missed`), extra note-ons
after the final step is already matched, per-step fault attribution (`faults[]`
entries and per-step `hardFaultCount` summing to the aggregate),
equal-offset tie-breaking by `sequenceNumber`, timing deviation boundary
values, the timing exclusion window (and its restart on a second hard
fault), overlap (note-off before/at/after the next note-on, and a missing
note-off), velocity having no effect, and `summary.passed` against
`maxTimingFaultsPerRun`, and best-fit timing residuals — see
`tests/scoring.test.ts`.

Client-side velocity-zero → `note_off` normalization
(`src/client/midi/capture.ts`) is covered: see
`tests/client-capture.test.ts` (fake MIDI messages, fake monotonic clock,
normalization, sequence ordering, negative count-in offsets, and the final
`POST /api/runs` request shape).
