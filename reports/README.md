# Reports

Findings from analysing recorded practice sessions. These are dated, one-off
investigations — distinct from `docs/`, which holds living documentation that
gets updated in place (backlog, acceptance checklist).

A report is a snapshot: once written it stays as it was, and a later
investigation becomes a new numbered report rather than an edit to an old one.

| # | Report | Subject |
|---|---|---|
| 001 | [MIDI latency](001-midi-latency/REPORT.md) | A ~45 ms systematic timing offset across 21 C major runs, and what it costs the pass rate |

## Layout

Each report owns a directory holding everything it depends on, so no report can
break another's figures and none depends on state outside the repo:

```
NNN-slug/
  REPORT.md      the write-up
  charts/        generated SVG figures, light + dark variants
  data/          the raw capture as committed CSV
```

`piano.db` is gitignored, so it is never the record of a session — the CSVs
under `data/` are. Regenerate a report's figures from its own committed data
with `npm run report:charts`; that needs no database and works on a fresh
clone. `npm run report:data` re-exports the CSVs and is the only step that
touches `piano.db`.
