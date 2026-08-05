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
- Fingering data for scales beyond the seeded C major is explicitly
  unresolved (see `ARCHITECTURE.md`). Do not invent black-key fingerings
  or their provenance.

## Known gaps / TODO

**Full catalog.** Only C major ascending is seeded. The 12-scale,
24-exercise catalog with `progression_groups`/`scales` tables is a
distinct later stage — deliberately not attempted yet. The `direction`
column now accepts `'descending'` (migration `0004`) and `scoreRun`
already handles it correctly (see the descending test in
`tests/scoring.test.ts`), but nothing seeds a descending exercise yet.

**Stage 2 scoring test coverage.** `scoreRun` (`src/domain/scoring.ts`)
implements more than the current tests exercise. Confirmed still missing:

- Wrong-pitch note-ons played *before* the tonic anchors
- A wrong-octave note played *after* anchoring
- Resynchronization: a later expected pitch skips ahead, marking the
  skipped steps `missed`
- Extra note-ons played after step 7 is already matched
- Per-step fault attribution: that `faults[]` entries and per-step
  `hardFaultCount` sum to the aggregate
- Equal-offset events ordered by `sequenceNumber` as tiebreaker
- Timing deviation boundary values (exactly at tolerance vs. one
  microsecond over)
- Timing exclusion window after a hard fault, and the window restarting
  on a second hard fault
- Overlap: note-off before/at/after the next note-on, and a missing
  note-off (`overlapReleaseMissing`)
- Velocity having no effect on scoring
- `summary.passed` against `maxTimingFaultsPerRun` /
  `maxOverlapFaultsPerRun`
- Client-side velocity-zero → `note_off` normalization
  (`src/client/midi/capture.ts`) — no test infrastructure for the client
  exists yet
