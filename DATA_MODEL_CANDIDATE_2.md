# Candidate 2: Compact Hybrid Model

## Summary

This model keeps each complete exercise definition in one seeded database row.
The ordered note spellings, semitone offsets, and fingering are stored as
structured JSON or database arrays rather than normalized step rows.

It minimizes schema size while retaining raw MIDI events and reproducible,
versioned scoring.

## ORM Diagram

```mermaid
erDiagram
    EXERCISE {
        int id PK
        string scale_name
        string direction
        int group_number
        int progression_order
        json note_spellings
        json semitone_offsets
        json finger_numbers
    }

    RUN {
        int id PK
        int exercise_id FK
        datetime performed_at
        int tempo_bpm
        string capture_status
    }

    MIDI_EVENT {
        int id PK
        int run_id FK
        int sequence_number
        bigint offset_us
        string event_type
        int midi_pitch
        int velocity
    }

    RUN_ASSESSMENT {
        int id PK
        int run_id FK
        string assessment_kind
        string algorithm_version
        json scoring_parameters
        int hard_fault_count
        int timing_fault_count
        int overlap_fault_count
        boolean passed
        datetime assessed_at
    }

    EXERCISE_PROGRESS {
        int exercise_id PK, FK
        int current_tempo_bpm
        int consecutive_clean_runs
    }

    EXERCISE ||--o{ RUN : attempted_as
    EXERCISE ||--o| EXERCISE_PROGRESS : has
    RUN ||--o{ MIDI_EVENT : captures
    RUN ||--o{ RUN_ASSESSMENT : receives
```

## Tables

### `exercises`

One row for each scale and direction. Group, scale identity, display name,
progression order, and direction are ordinary fields. The eight note spellings,
relative semitone offsets, and finger numbers are stored as structured values.

F-sharp/G-flat remains one physical scale. Ascending and descending remain
separate exercises.

### `runs`

One row per attempt, containing the exercise, performance date, tempo, and
capture status.

### `midi_events`

One row per normalized note-on or note-off message. Events use an explicit
sequence number and a signed microsecond offset from the first expected note.

### `run_assessments`

Versioned scoring results containing the algorithm version, complete scoring
parameters, aggregate statistics, and pass/fail outcome. Original and current
assessments are retained separately.

### `exercise_progress`

The current tempo and consecutive-clean-run count for each independently
progressing scale-direction exercise.

## Invariants

- Each exercise definition must contain eight aligned note, offset, and finger
  values.
- Relative semitone offsets allow the first valid note to anchor any octave.
- Raw MIDI events remain immutable.
- Event sequence numbers define deterministic ordering.
- Original assessments drive progression; current assessments show the latest
  interpretation.
- One expected note occurs per metronome beat.

Most exercise-definition invariants must be enforced by application-level
validation and tests because ordinary relational constraints cannot easily
validate aligned JSON arrays.

## Advantages

- It has the smallest schema of the three candidates.
- A complete exercise can be loaded without joining step rows.
- Seed data remains the database source of record.
- Raw events still permit future re-analysis.

## Disadvantages

- The database cannot easily enforce exactly eight correctly ordered steps.
- Fingering and pitch-shape constraints move into application tests.
- Cross-scale questions, such as comparing every step played with finger 4,
  require awkward JSON queries.
- Changes inside structured exercise data make less instructive migration
  examples.

This model fits if minimizing schema size is more important than demonstrating
relational domain modeling.
