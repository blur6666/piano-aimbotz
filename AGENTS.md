# Agent and contributor guide

`docs/SPEC.md` (product intent) and `docs/ARCHITECTURE.md` (decisions, invariants) are
the sources of truth — read them before changing behavior. This file is
operational only. Open work lives in `docs/BACKLOG.md`.

## Setup

```bash
npm install
cp .env.example .env   # edit for different tolerances/tempo
npm run migrate
npm run seed
```

## Running the app

Dev is **two** processes. Both are watchers: they never exit, so **background
them** — run each in its own terminal, or as a backgrounded task. A foreground
`npm run dev` blocks until killed.

```bash
npm run dev          # Fastify backend, :3000 — watcher, does not exit
npm run dev:client   # Vite dev server + HMR, :5173 — watcher, does not exit
```

In dev the app is **only at `http://localhost:5173`**. `:3000` serves the API
and nothing else — no SPA — so `GET :3000/` is a bare `404 Not Found`. Vite
proxies `/api` from `:5173` to `:3000`, which is why both must be up.

The backend must be on 3000. `vite.config.ts` hardcodes that proxy target
while the server honours `PORT`, so moving the backend leaves `:5173` loading
fine with every `/api` call broken. If 3000 is occupied, free it — do not
reassign the port.

OpenCode's Playwright must target `:5173`, and only after both processes are
running — OpenCode starts them itself, with the two commands above,
backgrounded. Playwright can drive the UI shell but **cannot complete a
practice run**: Web MIDI needs a real keyboard and is not automatable.
Hardware paths are checked by hand — `docs/MANUAL_ACCEPTANCE_CHECKLIST.md`.

`npm run start` builds and serves everything from one process on `:3000` —
production topology, no HMR. Use it to verify a build, not to iterate.

Claude Code only: its Browser pane reads `.claude/launch.json`, which defines
the same three as `backend`, `client`, and `app`. No other tool reads that
file — OpenCode included.

## Checks

All of these must pass before a change is done. CI
(`.github/workflows/ci.yml`) runs the same set plus migrate+seed against a
temporary database.

```bash
npm run typecheck
npm run lint
npm run format:check   # npx prettier --write <files> to fix
npm test               # npm run test:coverage for coverage
npm run build
```

If `format:check` fails on files you did not touch and `git diff` shows
nothing, suspect CRLF rather than formatting — `.gitattributes` pins the tree
to LF. Confirm with `head -3 package.json | cat -A` (`^M$` is CRLF, plain `$`
is LF). The usual cause is a worktree checked out before those rules landed;
commit or stash, then `git rm --cached -r . && git reset --hard`. Do not reach
for a repo-wide `prettier --write` — it buries the cause in a whole-file diff.

## Invariants

Full list: `docs/ARCHITECTURE.md` → "Invariants that must not be rediscovered".
Read it before touching scoring, progression, or the schema. Easiest to
violate by accident:

- One user, one process, one SQLite file. No queues, services, or CQRS
  without a concrete new requirement.
- `src/domain/scoring.ts` and `src/domain/progression/` are pure and
  deterministic — no Fastify, Drizzle, filesystem, or clock.
- Every persisted run has exactly one `run_assessments` row. Backfill a
  missing one (`npm run backfill-assessments`); never teach readers to
  tolerate its absence.
- `exercise_progress` is rebuildable: it must equal replaying
  `run_assessments` in `run_id` order from `initial_tempo_bpm`
  (`npm run rebuild-progress`).
- Migrations apply exactly once via `schema_migrations`
  (`src/server/db/apply-migrations.ts`). `IF NOT EXISTS` idempotency is not
  enough once a migration drops a column or rebuilds a table.
- Fingerings come only from `docs/major-minor-fingering.md` (right-hand major
  table, the sole reference). One-octave fingerings are the first seven
  fingers, ending on the higher finger of any "X/Y" choice; descending is the
  exact reverse of ascending. Never invent fingerings or provenance; change
  `catalog/v1.ts` only from that reference.
