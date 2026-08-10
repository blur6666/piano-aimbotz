# Spoken count-in samples

Four short clips named `1.mp3`, `2.mp3`, `3.mp3`, `4.mp3` — one spoken number
each. They are decoded once at page load (`src/client/metronome/countInVoice.ts`)
and scheduled on the same Web Audio clock as the click, so they stay locked to
the beat.

Nothing here is required. With the files absent the run proceeds with clicks
alone and logs one info line to the console.

## Constraints

- **No leading silence.** The sample is scheduled to start *on* the beat, so
  leading silence reads directly as a late count.
- **Shorter than one beat.** The count-in ticks on the **quarter note**
  (`beatMs = 60000 / tempoBpm` in `metronome/index.ts`), so the budget is
  750 ms at 80 bpm and 682 ms at 88 bpm — not the note interval. An earlier
  version of this file said 375 ms; that was the eighth-note spacing, and it
  understated the budget by half.

## The current samples

Placeholders generated with Windows SAPI (`Microsoft Zira Desktop`, rate +2),
silence-trimmed at -45 dB on both ends, peak-normalised to -1 dB, mono 44.1 kHz.
Durations 246-407 ms, so each occupies roughly a third to a half of the beat.
Measured MP3 encoder delay after round-trip is under 1 ms, well inside what the
grid cares about.

They are synthetic, not a human voice. Replacing them with a real recording is
a drop-in swap — same filenames, same constraints, no code change. If you record
your own, trim the leading silence tightly; that matters far more than the voice.
