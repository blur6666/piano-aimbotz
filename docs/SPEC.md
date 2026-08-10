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

**Two tracked dimensions: speed and accuracy.** Speed is tempo. Accuracy is faults (hard and soft — see "First deliverable"). Progress in either one is gated by the other:

- Tempo only climbs when a run is clean. This is what keeps speed from being gamed by luck: a single fast clean run doesn't move you forward, three consecutive ones do (concrete rule under "First deliverable").
- Moving to the next scale is guided by the same signal, but it is **advisory, not enforced** — the app recommends the next scale once you look ready on the current one, but nothing locks the others. There is no "mastered" flag or unlock table in v1. This is intentional, not an oversight: v1 has no defensible definition of scale mastery to gate on, and free navigation is simpler and still serves the same motivational purpose as long as the recommendation is visible.

**Beyond v1: analytical practice focus.** Beyond pass/fail and a tempo number, the eventual goal is to tell the player *where* they're going wrong in a way that's useful to fix — e.g. surfacing that they consistently rush the same step, or slow down at a specific transition (like the thumb-tuck in Group 1 fingering), or miss most often in a particular situation. This requires comparing *signed* timing deviation and fault location across many runs of the same exercise, not just the per-run aggregate `ARCHITECTURE.md` currently stores. It is **explicitly deferred** — not designed in v1 — but it is the reason raw MIDI events are stored forever instead of only aggregates (see "Data model philosophy" below): every future analysis, including this one, replays from the same untouched history.

---

# Deliverables

## First deliverable (v1-mvp)

### **Goal**: 
The user will be able to study their first scales already (major scales). It will still be a "sandbox", beta environment because we are still learning at this stage. Instead of real progression, the implemented scales will all be available via dropdown and the tempo can be customized freely. Even though. A first implementation of the progression will be present: through measuring and scoring sucessive runs, and given a few constants that are temporary, the player will "go up a level" increasing the BPM. By constants I mean: 3 sucessive runs with >90% accuracy. We'll need real data to choose good coeficients.

### Exercises shapes and motion

- **Scales for right hand only** Might be revisited later.
- **Support for one or two octaves only**, ascending and 
- **Only ascending and descending motions**
  - No arpeggios or complex patterns 
- **Ascending and descending will be scored separately.** 
  - The thumb movement differs — tuck under going up, cross over coming down — and most players are measurably worse in one direction
  - Do not aggregate their data together
- **Fixed tempo per run.** 
  - Varying tempo is wanted later. Free tempo probably never — it turns "late" from a subtraction into an inference problem.
  - Display both the scale and the fingering.
  - Option to repeat runs one after the other automastically (separated by a count-in)
- **Fingering source of record: `docs/SCALES_FINGERING_REFERENCE.md`** (right-hand major table). 
  - Its charts are two octaves; one-octave fingering is the first seven fingers, ending on the higher finger of any "X/Y" choice. 
  - A single authority is used and the fingering table is treated as data rather than something recited. This is resolved, not open — see `ARCHITECTURE.md` for how the catalog consumes it.


## Second deliverable (v2)

### Progression

We will follow common practice in piano lessons: ordered by **fingering pattern**, not by accidental count. The goal is to minimise how many physical patterns must be memorised, in what order. Accelerating the progress and mnotivation. C major is the first scale a player sees.

- **At this stage**, the user wont be in sandbox mode anymore, and improving his technique and achieving the set goals will be necessary to increasing BPM, with good accuracy, until the next scale is unlockied

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
- Thumb avoids the black key, so the pattern shifts and the octave ends on 4 rather than 5.

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


**But these do not share a pattern.** 
- Each has its own right-hand fingering, resolved with provenance in `docs/SCALES_FINGERING_REFERENCE.md`: 
- B♭, D♭, and G♭ all start on finger 2; 
- E♭ and A♭ start on finger 3. 
- Five separate memorisations, made easier by hand position rather than by a common shape.

----

Groups 1 and 3 are therefore grouped on different principles: Group 1 is "one shape, many scales", Group 3 is "many shapes, all comfortable". The progression logic should know that the boundary between them changes what advancement means.

**F♯ and G♭ are one entry, not two.** Identical keys, identical fingering. Fingering is physical; the spelling difference is notational only. They are enharmonic.

### Advancement rule

Tempo is the progression axis; accuracy is the gate. Start low (around 60bpm) and climb. Advance when the player achieves **three consecutive runs with zero hard faults and soft faults under a threshold**. The exact numbers are unknowable without real data — they get tuned once sessions exist (see "Out of scope"). This design cannot be gamed by slowing down, because slowing down is the failure state rather than a way to pass.

Advancing to the *next scale* is a recommendation the app surfaces, not a gate (see "Product vision").

Mastered scales reappearing in rotation once other scales are learned is optional, not v1.

### The run

- Metronome plays a **4-beat count-in**, then **continues through the exercise**. This is a training tool, not a test — the click stays on.
- Expected sequence for C ascending: C D E F G A B C.
- Because tempo is fixed and the count-in is known, the beat grid is known. Every note's timing deviation is a subtraction against that grid, not an inference.

### Faults

**Hard fault** — binary, per note:
- A note played out of order (wrong key, missed accidental).
- An extra note. Includes duplicates and glancing an adjacent key. If this proves too aggressive in practice, add a debounce later rather than softening the rule now (see "Out of scope").

**Soft fault, type 1 — timing:** deviation in milliseconds from the expected beat. Accumulates into an accuracy figure rather than passing or failing.

**Soft fault, type 2 — overlap:** the previous note hasn't been released before the next sounds. Legato bleed. This is one of the most common scale technique problems and it does *not* correlate with timing, so it's worth capturing separately. Requires storing note-off as well as note-on.

**Recovery handling:** a hard fault does **not** end the run. The run continues, but a window of notes following the fault is **excluded from timing statistics** — the note after a stumble is late for reasons that have nothing to do with timing, and including it contaminates the evenness measurement.

### Velocity

Possibly ignored entirely in v1. No accent-on-the-downbeat expectations. If used at all, only flag notes that are very far off, and only after finding a sane calibration. Not a v1 blocker.

### Output shape

Per scale, per direction, per step: the number of hard and soft faults.

Notes and fingering are **fixed per scale**, so within a single scale, step index and finger number carry the same information. Storing the finger only matters if you later want to ask cross-scale questions — position 4 is finger 1 in C major but finger 4 in F major.

### Data model philosophy

Store raw events, not derived aggregates: **the number of messages in a run is unknown in advance** — extra notes, missed notes, and the fact that note-on and note-off are separate messages all break any one-to-one mapping onto the expected steps. The expected sequence is already known from the scale definition, so matching played events against expected steps is **analysis, not storage**. Store what happened; derive what it means.

This also settles the raw-versus-aggregate question generally: keep raw events so old sessions can be re-analysed whenever the scoring logic improves, or whenever a new kind of analysis (like the rushing/slowing detection under "Product vision") gets built. Derived per-step stats may be materialised into their own table later if query performance calls for it.

The realized schema lives in `ARCHITECTURE.md` and is the authority — this section states the storage philosophy behind it, not the table layout.

## Might go into v2 scope if easy
- Sheet music rendering - We've implemented very easily in other project due to easy to ue. library. It is good for the student to learn both the movement and notation at the same time or not that far appart.

## Out of scope

**Not v1, each its own project or later increment:** sight-reading, rhythm exercises beyond straight eighths/quarters, two hands, more than two octaves, arpeggios, free tempo.

**Deferred, to be decided from real session data rather than guessed up front:**

- **Failed-run behavior and thresholds.** Whether a failed run resets the consecutive-clean-run counter or steps the tempo down, and the actual soft-fault tolerances, timing/overlap tolerances, tempo increment, tempo decrement, and starting tempo. These are tuning parameters, not architecture — see `ARCHITECTURE.md`'s "Configuration and deferred decisions."
- **Extra-note debounce.** Deferred by decision; will likely need revisiting once there's real data on how aggressive the current all-extras-are-hard-faults rule feels in practice.


---