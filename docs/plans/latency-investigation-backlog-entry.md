# Plan — Reframe the latency item as an investigation

> **For the implementing agent:** this is a `docs/BACKLOG.md` edit only.
> **No code, no migration, no tests, no other file.** Run
> `npm run lint && npm test` at the end to confirm nothing was disturbed.

## Context

`docs/BACKLOG.md` currently carries **"[TODO] Correct the expected beat grid for
audio output latency"**, which prescribes a specific implementation: measure
`AudioContext.outputLatency` at the end of a run, store it as
`output_latency_us` via a migration `0008`, and add it to every
`expectedOffsetUs` in `scoreRun`.

Report 001 (`reports/001-midi-latency/REPORT.md`) was written after that item
and contradicts it. Recommendation #2 reads: *"Do not hard-code a 45 ms latency
constant. The offset is partly human and partly tempo-dependent; a flat
correction overcorrects settled runs."*

Neither position has enough evidence to win yet, so the item becomes a research
task rather than an implementation task. Do not implement either approach.

Two incidental notes: the migration number `0008` is taken by
`docs/plans/two-octave-scales.md` regardless, and that plan ships first.

## The edit

Delete the existing **"[TODO] Correct the expected beat grid for audio output
latency"** item — the whole bullet including its `_Why:_`, `_Do not_`, `_Plan:_`
and `_Consequence:_` sub-bullets — and replace it with an investigation entry.

Write it in the voice of the surrounding entries: a bold `**[TODO] …**`
headline followed by italic `_Label:_` sub-bullets. Match the existing density —
those entries explain *why*, not just *what*. **Do not pick a winner.**

The entry must cover:

- **The two positions.**
  - (a) A measured `AudioContext.outputLatency` is a real physical delay
    between when we timestamp the click and when the player hears it, so
    correcting for it is physically motivated. The backlog's original figures:
    mean lateness across 21 runs was +46 ms and `outputLatency` on this machine
    reads 42 ms, which agree within ~3 ms.
  - (b) Report 001 rec #2: the offset resets to ~78–81 ms on every tempo change
    and decays ~3.9 ms per attempt (r = −0.56), which fixed hardware latency
    cannot produce. A flat correction therefore overcorrects settled runs. Name
    run 5 — it passes today and *gains* a fault under flat −45 ms compensation.

- **The unresolved tension.** The 84 bpm block settles to a 2 ms offset. If a
  genuine ~42 ms output latency were being subtracted, those runs would land
  near −40 ms and fail. Either the player anticipates the click, or the measured
  latency is not what reaches the ears. This dataset cannot separate MIDI device
  latency, audio output latency and human reaction lag — report 001 says so in
  its own caveat.

- **The alternative already on the table.** Report 001 rec #1: score against
  each run's own best-fit line instead of the absolute grid. Takes passing runs
  from 9 to 20 and faulted notes from 35 to 1, needs no latency assumption, and
  still measures evenness — which is the quantity of interest. Report 001 calls
  it the highest-value change in it. It changes what "passing" means, so stored
  assessments need re-scoring.

- **What would settle it.** Report 001 rec #7: capture a reference run with
  known device latency. A loopback or click-track measurement that isolates
  device latency from human reaction lag is the missing evidence, and until it
  exists this stays an open question rather than a task.

- **The re-scoring consequence.** Whichever way it goes, the decision re-scores
  stored runs. The chosen path is to re-score and rebuild progress via
  `rebuildExerciseProgress` (`src/server/progress/rebuild.ts`), driven by
  `npm run rebuild-progress`, rather than leaving old assessments as-is. Expect
  the tempo ceiling to jump; consider resetting the climb rather than
  inheriting it.

## Keep these two details verbatim

Both hold whichever way the decision goes, and both are easy to lose:

- `outputLatency` reads 0 on a freshly created `AudioContext` — it reports
  nothing until the device is actually rendering. It must be sampled at the
  **end** of a run, once the context has been clicking for seconds.
- Every run recorded so far was scored against the uncorrected grid.

## Cross-reference

Link `reports/001-midi-latency/REPORT.md` from the entry so the evidence stays
one click away. The relevant sections there are *The offset is not constant*
and *Recommendations*.

## Verification

```bash
npm run lint && npm test    # nothing should change; the current suite stays green
git diff --stat             # docs/BACKLOG.md must be the ONLY modified file
```

Read the rewritten entry back and confirm a reader who has not seen report 001
could tell, from the entry alone, what the disagreement is and what evidence
would resolve it.
