# Piano scale trainer — spec seed

## Read this first

**This is a hobby project.** Its purposes, in order:

1. Help me practise piano scales. I will actually use this.
2. Give me practice building something with persistence, migrations, tests and
   CI — my existing projects are all frontend-only, and this is the gap I'm
   deliberately closing.
3. Serve as a portfolio piece.

**One user: me.** No multi-tenancy. No auth beyond the bare minimum. No scale
requirements, no availability requirements, no SLA. If it breaks I fix it.

**Do not propose:** microservices, event sourcing, CQRS, message queues,
Kubernetes, service meshes, caching layers, GraphQL federation, DDD aggregates,
hexagonal/clean-architecture ceremony, or anything justified by a problem I
don't have. Boring technology, one deployable, one database.

**But small does not mean careless.** The data model, the migrations and the
tests *are* the point — they're the skills I'm building and the thing a
reviewer would actually look at. Specifically I want:

- a schema whose decisions I can defend in writing
- real migrations, including at least one that alters an existing table
- tests that encode domain rules, not just HTTP status codes
- CI running those tests on push

**KISS is an explicit stance**, consistent with my other projects: no
resilience layers, no graceful degradation, no edge-case armour. I tinker and
fix breakage myself. Where a simple thing and a general thing both work, pick
the simple one and write down why.

**The code will be written by AI agents against this spec**, so favour explicit
contracts, clear file boundaries and stated invariants over cleverness. Things
that must not be rediscovered should be written down.

---

Everything below has been decided; the open questions at the end have not.

**Concept:** keybr.com, but for piano scales. Play a scale against a metronome,
get measured, advance when you're clean enough.

**Why this project:** it's the missing third piece next to two existing tools —
`circle-of-fifths` (explore) and `piano-music-theory-sandbox` (identify). This
one is *practice*. It's also the first project of mine that genuinely needs
persistence: without stored per-step history there's no adaptation and no
progression, so the database isn't decoration.

---

## Decided

### Exercise shape

- **One hand only** (right hand) for v1. Not permanent — revisit later.
- **One octave** for v1, ascending and descending. Also a scope decision, not
  a permanent one.
- **Ascending and descending are separate exercises.** The thumb movement
  differs — tuck under going up, cross over coming down — and most players are
  measurably worse in one direction. Do not aggregate them together.
- **Fixed tempo for v1.** Varying tempo is wanted later. Free tempo probably
  never — it turns "late" from a subtraction into an inference problem.
- Display both the scale **and** the fingering, in the style of
  pianoscales.org.

### Progression

Ordered by **fingering group**, not by accidental count. The goal is to
minimise how many physical patterns must be memorised, in what order.

Fingering data source of record: **pianoscales.org**. Sources disagree on the
black-key scales (B♭ right hand comes back as both 4-1-2-3-1-2-3-4 and
2-1-3-1-2-3-1-2 depending on where you look), so pick one authority and treat
the fingering table as data rather than something recited.

### Group 1 — shared fingering: C, G, D, A, E, B

Six scales, one right-hand pattern: **1-2-3-1-2-3-4-5**. Learn the shape once.

Note the hand asymmetry, which matters because v1 is right hand only:

| Scale | RH | LH |
| --- | --- | --- |
| C, G, D, A, E | 1-2-3-1-2-3-4-5 | 5-4-3-2-1-3-2-1 |
| **B** | 1-2-3-1-2-3-4-5 (standard) | **4-3-2-1-4-3-2-1** (unique) |
| **F** | **1-2-3-4-1-2-3-4** (unique) | 5-4-3-2-1-3-2-1 (standard) |

B is a left-hand exception, not a right-hand one — so for a right-hand v1 it
belongs in Group 1. F is the reverse.

### Group 2 — the white-key exception: F

The only right-hand exception among the white-key scales. Thumb avoids the
black key, so the pattern shifts and the octave ends on 4 rather than 5.

### Group 3 — black-key scales: B♭, E♭, A♭, D♭, G♭

Ergonomically the easiest to play — the longer fingers (2, 3, 4) sit naturally
on the raised black keys while the thumb and pinky reach the white keys below
— despite looking intimidating on the page.

**But these do not share a pattern.** Each has its own right-hand fingering:
B♭ starts on 4 and tucks the thumb immediately, E♭ starts on 3, D♭ starts on
2. Five separate memorisations, made easier by hand position rather than by a
common shape.

Groups 1 and 3 are therefore grouped on different principles: Group 1 is "one
shape, many scales", Group 3 is "many shapes, all comfortable". The progression
logic should know that the boundary between them changes what advancement
means.

**F♯ and G♭ are one entry, not two.** Identical keys, identical fingering.
Fingering is physical; the spelling difference is notational only.

Twelve entries total.

- Advance when the current scale is clean past a threshold.

### The run

- Metronome plays a **4-beat count-in**, then **continues through the
  exercise**. This is a training tool, not a test — the click stays on.
- Expected sequence for C ascending: C D E F G A B C.
- Because tempo is fixed and the count-in is known, the beat grid is known.
  Store the run's tempo and the first expected beat time so every note's
  deviation is a subtraction.

### Faults

**Hard fault** — binary, per note:
- A note played out of order (wrong key, missed accidental).
- An extra note. Includes duplicates and glancing an adjacent key. If this
  proves too aggressive in practice, add a debounce later rather than softening
  the rule now.

**Soft fault, type 1 — timing:** deviation in milliseconds from the expected
beat. Accumulates into an accuracy figure rather than passing or failing.

**Soft fault, type 2 — overlap:** the previous note hasn't been released before
the next sounds. Legato bleed. This is one of the most common scale technique
problems and it does *not* correlate with timing, so it's worth capturing
separately. Requires storing note-off as well as note-on.

**Recovery handling:** a hard fault does **not** end the run. The run
continues, but a window of notes following the fault is **excluded from timing
statistics** — the note after a stumble is late for reasons that have nothing
to do with timing, and including it contaminates the evenness measurement.

### Velocity

Possibly ignored entirely in v1. No accent-on-the-downbeat expectations. If
used at all, only flag notes that are very far off, and only after finding a
sane calibration. Not a v1 blocker.

### Output shape

Per scale, per direction, per step: the number of hard and soft faults.

Notes and fingering are **fixed per scale**, so within a single scale, step
index and finger number carry the same information. Storing the finger only
matters if you later want to ask cross-scale questions — position 4 is finger 1
in C major but finger 4 in F major.

---

## Data model, roughly

Two tables:

**Runs** — one row per attempt. Scale, direction, tempo, first-beat timestamp,
pass/fail, aggregate stats.

**Events** — one row per MIDI message. Run, timestamp, type (note-on or
note-off), pitch, velocity.

**Not** one row per expected note. The number of messages in a run is unknown
in advance — extra notes, missed notes, and the fact that note-on and note-off
are separate messages all break any one-to-one mapping onto the eight expected
steps.

The expected sequence is already known from the scale definition, so matching
played events against expected steps is **analysis, not storage**. Store what
happened; derive what it means.

This also settles the raw-versus-aggregate question: store raw events, so old
sessions can be re-analysed when the scoring logic improves. Derived per-step
stats may be materialised into a third table later if query performance calls
for it.

---

## Open questions

**Resolved — advancement rule.** Tempo is the progression axis; accuracy is
the gate. Start low (around 60bpm) and climb. Advance when the player achieves
**three consecutive runs with zero hard faults and soft faults under a
threshold**. The exact numbers are unknowable without real data — they get
tuned once sessions exist.

This design cannot be gamed by slowing down, because slowing down is the
failure state rather than a way to pass.

**Resolved — mastered scales in rotation:** optional. Not v1.

**Deliberately deferred:** what happens on a failed run — reset the
consecutive-clean counter, or step the tempo down. Also the actual threshold
numbers, and the canonical source for fingering data. These are tuning
parameters, not architecture. Build the basic loop, play real sessions, then
decide from data.

Storing raw MIDI events rather than computed statistics is what makes this
safe: every scoring and advancement rule can change later without invalidating
sessions already recorded.

4. **Extra-note debounce.** Deferred by decision, but will likely need
   revisiting once there's real data.

**Resolved — F♯ / G♭:** one entry. Fingering is physical.

**Resolved — ordering principle:** fingering groups, not accidental count.
Accidental count is a notational difficulty measure, not a physical one — the
black-key scales look hardest on the page and are the most comfortable under
the hand.

**Resolved — velocity calibration:** out of scope.

5. **The actual schema.** Column types, indexes, and which aggregates are
   stored versus derived. This depends on answers to 1–3, since those determine
   what questions the tables have to answer.

---

## Scope discipline

Explicitly **not** v1: sight-reading, rhythm exercises beyond straight
eighths/quarters, sheet music rendering, two hands, multi-octave, arpeggios,
free tempo. Each is its own project.
