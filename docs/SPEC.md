# Piano scale trainer — spec

## Project context

**This is a hobby project.** Its purposes, in order:

1. Help me practise piano scales. I will actually use this.
2. Give me practice building something with persistence, migrations, tests and CI — my existing projects are all frontend-only, and this is the gap I'm deliberately closing.
3. Serve as a portfolio piece.

**One user: me.** No multi-tenancy. No auth beyond the bare minimum. No availability requirements, no SLA. If it breaks I fix it.

**Concept:** keybr.com, but for piano scales. Play a scale against a metronome, get measured, advance when you're clean enough.

**Why this project:** it's the missing third piece next to two existing tools — `circle-of-fifths` (explore) and `piano-music-theory-sandbox` (identify). This one is *practice*. It's also the first project of mine that genuinely needs persistence: without stored per-step history there's no adaptation and no progression, so the database isn't decoration.

**Document roles:** this file is the source of truth for product intent and scope. `ARCHITECTURE.md` is the source of truth for *how* — schema, contracts, rationale — once a decision below has been turned into code. `AGENTS.md` is operational (how to run/check). Don't duplicate implementation detail back into this file.

---

## Limitations

**Do not propose:** microservices, event sourcing, CQRS, message queues, Kubernetes, service meshes, caching layers, GraphQL federation, DDD aggregates, hexagonal/clean-architecture ceremony, or anything justified by a problem I don't have. Boring technology, one deployable, one database.

**KISS is an explicit stance**, consistent with my other projects: no resilience layers, no graceful degradation, no edge-case armour. I tinker and fix breakage myself. Where a simple thing and a general thing both work, pick the simple one and write down why.

**But small does not mean careless.** The data model, the migrations and the tests *are* the point — they're the skills I'm building and the thing a reviewer would actually look at. Specifically I want:

- a schema whose decisions I can defend in writing
- real migrations, including at least one that alters an existing table
- tests that encode domain rules, not just HTTP status codes
- CI running those tests on push

**The code will be written by AI agents against this spec**, so favour explicit contracts, clear file boundaries and stated invariants over cleverness. Things that must not be rediscovered should be written down.

---

## Product vision

**It is both a tool and a toy.** As a tool, it's a guided practice path: start at the easiest scale (C major), and get told when you're actually ready to move on rather than guessing. As a toy, that same guidance is deliberately gamified — visible streaks, a climbing tempo number, a scale list you're working through — because the point is to stay motivated to keep practising, not just to have accurate measurement for its own sake.

**Two tracked dimensions: speed and accuracy.** Speed is tempo. Accuracy is faults, hard and soft (see "Faults"). Progress in either one is gated by the other:

- Tempo only climbs when a run is clean. This is what keeps speed from being gamed by luck: a single fast clean run doesn't move you forward, three consecutive ones do (concrete rule under "Advancement rule").
- Moving to the next scale is guided by the same signal, but it is **advisory, not enforced** — the app recommends the next scale once you look ready on the current one, but nothing locks the others. There is no "mastered" flag or unlock table in v1. This is intentional, not an oversight: v1 has no defensible definition of scale mastery to gate on, and free navigation is simpler and still serves the same motivational purpose as long as the recommendation is visible.

**Beyond v1: analytical practice focus.** Beyond pass/fail and a tempo number, the eventual goal is to tell the player *where* they're going wrong in a way that's useful to fix — e.g. surfacing that they consistently rush the same step, or slow down at a specific transition (like the thumb-tuck in Group 1 fingering), or miss most often in a particular situation. This requires comparing *signed* timing deviation and fault location across many runs of the same exercise, not just the per-run aggregate `ARCHITECTURE.md` currently stores. It is **explicitly deferred** — not designed in v1 — but it is the reason raw MIDI events are stored forever instead of only aggregates (see "Data model philosophy" below): every future analysis, including this one, replays from the same untouched history.

---

## Deliverables

Two slices. **v1** is the product as specified: everything under it is decided and implementable today. **v2** is direction — it exists so agents and future me know which way things are meant to grow, and nothing in it may be built before it has been designed and moved up into v1.

There is no separate "mvp" tier below v1. v1 is deliberately small and its thresholds are provisional; that is described in its goal rather than split into another slice.

### v1 — the guided practice loop

**Done when:** every right-hand major scale can be played ascending and descending against the metronome, a completed run is captured and scored end to end, three consecutive clean runs raise that exercise's tempo, raw events are stored so old runs can be re-scored, and the schema/migrations/domain tests/CI listed under "Limitations" actually exist.

Most of that is already true — v1 is largely built. This is the acceptance bar, not a to-do list; don't open work to "implement v1".

#### Goal

Practise the right-hand major scales against a metronome and get a measured verdict on every run. Every implemented scale is selectable from the start — v1 recommends the next one but never locks any of them (see "Product vision"). Scored runs happen at the tempo the server holds for that exercise, and three consecutive clean runs raise it.

**v1 is a sandbox in one specific sense: the numbers are placeholders.** The advancement rule below is fixed and real, but the constants it depends on — starting tempo, tempo increment, timing and overlap tolerances, how many soft faults a clean run may still contain — are guesses until there is enough real session data to tune them (see "Out of scope"). Expect them to move; don't treat any committed value as a product decision.

**Accuracy is fault counts, not a percentage.** There is no "≥90% of notes correct" gate anywhere in v1. A run passes on zero hard faults with soft faults under threshold (see "Advancement rule"), because a percentage flattens a wrong note and a slightly late note into the same number and those are not the same mistake.

**Free tempo is a practice aid, never an advancement path.** A practice mode may run any exercise at any tempo — for warming up, or for trying something well above the current level — but those runs are not submitted, not stored, and do not touch progress. Every *scored* run uses the server-owned tempo for its exercise; the browser does not get to pick one. This is load-bearing: if the player chose the tempo of a scored run, "late" would stop being a subtraction against a known beat grid and BPM would become trivially gameable.

#### Exercise shape and motion

- **Right hand only.** May be revisited later.
- **One or two octaves only.** Every scale exists at both counts: the fingering reference charts two octaves for all twelve, so nothing is held back for want of a source.
- **Ascending and descending motion only.**
  - No arpeggios and no broken patterns.
- **Ascending and descending are scored separately.**
  - The thumb movement differs — tuck under going up, cross over coming down — and most players are measurably worse in one direction.
  - Do not aggregate their data together.
- **Fixed tempo per run.**
  - Tempo that varies *within* a run is wanted later. Free tempo for scored runs, never — see the goal above.
- **Display both the scale and the fingering** during the run.
- **Optional auto-repeat:** runs chain one after another until stopped, separated by one beat of gap and then the usual count-in. Chaining continues whether a run passed or failed — the point is staying in the loop, not being rewarded for a streak.
- **Fingering source of record: `docs/SCALES_FINGERING_REFERENCE.md`** (right-hand major table).
  - Its charts are two octaves; one-octave fingering is the first seven fingers, ending on the higher finger of any "X/Y" choice.
  - A single authority is used and the fingering table is treated as data rather than something recited. This is resolved, not open — see `ARCHITECTURE.md` for how the catalog consumes it.
  - The note and finger cells in "Progression order" below are illustrative. **Where they and the reference disagree, the reference wins.**

#### Progression order

Scales are ordered the way piano lessons order them: by **fingering pattern**, not by accidental count. The goal is to minimise how many physical patterns must be memorised, and to meet them in a useful order — fewer new shapes per scale means faster progress and less discouragement. C major is the first scale a player sees.

This order drives the recommendation and the presentation order only. It is not a lock (see "Product vision"). This section owns the order and the reason for it; the notes and fingerings themselves belong to `docs/SCALES_FINGERING_REFERENCE.md`.

**Group 1 — shared fingering: C, G, D, A, E, B.**

- Six scales, one right-hand pattern: **1-2-3-1-2-3-4-5**. Learn the shape once.

| Key | Notes | Fingering |
| --- | --- | --- |
| C | `C  D  E  F  G  A  B  C` | 1-2-3-1-2-3-4-5 |
| G | `G  A  B  C  D  E  F# G` | 1-2-3-1-2-3-4-5 |
| D | `D  E  F# G  A  B  C# D` | 1-2-3-1-2-3-4-5 |
| A | `A  B  C# D  E  F# G# A` | 1-2-3-1-2-3-4-5 |
| E | `E  F# G# A  B  C# D# E` | 1-2-3-1-2-3-4-5 |
| B | `B  C# D# E  F# G# A# B` | 1-2-3-1-2-3-4-5 |

- B is a left-hand exception, not a right-hand one — so for a right-hand v1 it belongs in Group 1. F is the reverse.

**Group 2 — the white-key exception: F.**

- The only right-hand exception among the white-key scales.
- The thumb avoids the black key, so the pattern shifts and the octave ends on 4 rather than 5.

| Key | Notes | Fingering |
| --- | --- | --- |
| F | `F G A Bb C D E F` | 1-2-3-4-1-2-3-4 |

**Group 3 — black-key scales: B♭, E♭, A♭, D♭, G♭.**

- Ergonomically the easiest to play — the longer fingers (2, 3, 4) sit naturally on the raised black keys while the thumb and pinky reach the white keys below — despite looking intimidating on the page.

| Key | Notes | Fingering |
| --- | --- | --- |
| Bb | `Bb C  D  Eb F  G  A Bb` | 2-1-2-3-1-2-3-4 |
| Eb | `Eb F  G  Ab Bb C  D Eb` | 3-1-2-3-4-1-2-3 |
| Ab | `Ab Bb C  Db Eb F  G Ab` | 3-4-1-2-3-1-2-3 |
| Db | `Db Eb F  Gb Ab Bb C Db` | 2-3-1-2-3-4-1-2 |
| Gb | `Gb Ab Bb B  Db Eb F Gb` | 2-3-4-1-2-3-1-2 |

**But these do not share a pattern.** Each has its own right-hand fingering, resolved with provenance in `docs/SCALES_FINGERING_REFERENCE.md`:

- B♭, D♭ and G♭ all start on finger 2.
- E♭ and A♭ start on finger 3.
- Five separate memorisations, made easier by hand position rather than by a common shape.

Groups 1 and 3 are therefore grouped on different principles: Group 1 is "one shape, many scales", Group 3 is "many shapes, all comfortable". **In v1 that difference is presentational only.** Advancement is per exercise (see "Advancement rule"); crossing a group boundary changes nothing mechanically, it only changes what the app has to say to the player — the next scale in Group 1 is a shape they already own transposed, while the first scale in Group 3 is a new one to memorise. There is no cross-group advancement rule in v1 and none is implied here; don't invent one.

**F♯ and G♭ are one entry, not two.** Identical keys, identical fingering. Fingering is physical; the spelling difference is notational only. They are enharmonic. Twelve entries total.

#### Advancement rule

Tempo is the progression axis; accuracy is the gate. Start low (e.g. around 60bpm — the real value is a deferred constant, see "Out of scope") and climb. Advance when the player achieves **three consecutive runs with zero hard faults and soft faults under a threshold**. The exact numbers are unknowable without real data — they get tuned once sessions exist (see "Out of scope"). This design cannot be gamed by slowing down, because slowing down is the failure state rather than a way to pass.

Advancing to the *next scale* is a recommendation the app surfaces, not a gate (see "Product vision"). In v1 that recommendation **is the ordering itself**: exercises are presented in progression order, and the one to be working on is the first that isn't clean yet. A distinct affordance for it — a badge, a pinned entry, explicit copy — is **not built**. That is the one genuine product hole inside an otherwise decided v1, and it is named here rather than left to be discovered.

Mastered scales reappearing in rotation once other scales are learned is optional, not v1.

#### The run

- Metronome plays a **4-beat count-in**, then **continues through the exercise**. This is a training tool, not a test — the click stays on.
- Expected sequence for C ascending: C D E F G A B C.
- Because tempo is fixed and the count-in is known, the beat grid is known. Every note's timing deviation is a subtraction against that grid, not an inference.

#### Faults

**Hard fault** — binary, per note:

- A note played out of order (wrong key, missed accidental).
- An extra note. Includes duplicates and glancing an adjacent key. If this proves too aggressive in practice, add a debounce later rather than softening the rule now (see "Out of scope").

**Soft fault, type 1 — timing:** deviation in milliseconds from the expected beat. Each note's deviation is *graded*, not passed or failed — one late note never fails a run by itself. What gates a clean run is the **count** of notes outside tolerance (see "Advancement rule").

**Soft fault, type 2 — overlap:** the previous note hasn't been released before the next sounds. Legato bleed. This is one of the most common scale technique problems and it does *not* correlate with timing, so it's worth capturing separately. Requires storing note-off as well as note-on.

**Recovery handling:** a hard fault does **not** end the run. The run continues, but a window of notes following the fault is **excluded from timing statistics** — the note after a stumble is late for reasons that have nothing to do with timing, and including it contaminates the evenness measurement.

#### Velocity

**Captured, stored, and ignored by v1 scoring.** No accent-on-the-downbeat expectations, no dynamics gate, no accent logic — velocity changes no v1 result. It is stored anyway because later analysis may want it. Scoring it at all needs a sane calibration first, and that is a v2 decision, not something to add opportunistically.

#### Output shape

Per scale, per direction, per step: the number of hard and soft faults. That is the *product grain* — what the player is entitled to see about a run. The wire and storage shapes (run aggregates, streak, tempo after the run) live in `ARCHITECTURE.md` and are the authority; do not derive a second DTO from this paragraph.

Notes and fingering are **fixed per scale**, so within a single scale, step index and finger number carry the same information. Storing the finger only matters if you later want to ask cross-scale questions — position 4 is finger 1 in C major but finger 4 in F major.

#### Data model philosophy

Store raw events, not derived aggregates: **the number of messages in a run is unknown in advance** — extra notes, missed notes, and the fact that note-on and note-off are separate messages all break any one-to-one mapping onto the expected steps. The expected sequence is already known from the scale definition, so matching played events against expected steps is **analysis, not storage**. Store what happened; derive what it means.

This also settles the raw-versus-aggregate question generally: keep raw events so old sessions can be re-analysed whenever the scoring logic improves, or whenever a new kind of analysis (like the rushing/slowing detection under "Product vision") gets built. Derived per-step stats may be materialised into their own table later if query performance calls for it.

The realized schema lives in `ARCHITECTURE.md` and is the authority — this section states the storage philosophy behind it, not the table layout.

### v2 — direction

Direction only. Nothing here is designed, and none of it may be implemented until it has been specified above.

**Done when:** not defined yet. Each item below has to earn a v1-style section — including a "done" line — before it becomes work.

- **Real gates instead of recommendations.** v1 recommends the next scale and locks nothing, because it has no defensible definition of scale mastery (see "Product vision"). If real session data produces one, v2 may turn the recommendation into an actual gate: climb BPM at good accuracy on the current scale until the next one unlocks, no free jumping. That change would **explicitly supersede** the advisory bullet in "Product vision", and superseding it means editing that bullet in this file — until then, advisory stands and no unlock table gets built on the strength of this paragraph.
- **Tuned constants.** The placeholder thresholds under "Goal" replaced with values chosen from real sessions rather than guessed.
- **Analytical practice focus.** Telling the player *where* they go wrong, not just whether the run passed. Described under "Product vision"; the raw-event storage in v1 exists to make it possible.
- **Tempo that varies within a run** — accelerating and decelerating exercises. Still server-owned, still not free tempo.
- **Rotation.** Learned scales reappearing periodically once later scales are in progress.
- **Sheet music rendering.** Cheap: it was straightforward in another project of mine thanks to an easy-to-use library. Worth doing because the player should learn the movement and the notation in the same session rather than months apart. This is the most likely v2 item to land early precisely because it's cheap.

## Out of scope

**Not v1, and not planned:** a hard scale-lock / unlock table, or a "mastered" flag. v1 recommends the next scale; it does not gate. This is a v2 *candidate* only, under the conditions stated there.

**Not v1, each its own project or later increment:** sight-reading, rhythm exercises beyond straight eighths/quarters, two hands, more than two octaves, arpeggios, free tempo for scored runs.

**Deferred, to be decided from real session data rather than guessed up front:**

- **Failed-run behavior and thresholds.** Whether a failed run resets the consecutive-clean-run counter or steps the tempo down, and the actual soft-fault tolerances, timing/overlap tolerances, tempo increment, tempo decrement, and starting tempo. These are tuning parameters, not architecture — see `ARCHITECTURE.md`'s "Configuration and deferred decisions."
- **Extra-note debounce.** Deferred by decision; will likely need revisiting once there's real data on how aggressive the current all-extras-are-hard-faults rule feels in practice.

**Nothing is currently blocked on missing fingering sources.** `docs/SCALES_FINGERING_REFERENCE.md` charts two octaves for all twelve major scales, and all twelve are seeded at both octave counts. The standing rule is unchanged and applies to anything the reference does *not* cover: agents must take fingerings from it, never invent them.
