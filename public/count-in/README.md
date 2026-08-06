# Spoken count-in samples

Drop four short clips here, named `1.mp3`, `2.mp3`, `3.mp3`, `4.mp3` —
one spoken number each. They are decoded once at page load and scheduled
on the same Web Audio clock as the click, so they stay locked to the beat.

Keep them short (well under one beat: 375 ms at 80bpm eighths) and trim any
leading silence — the sample is scheduled to start *on* the beat, so
leading silence reads as a late count.

Nothing here is required. With the files absent the run proceeds with
clicks alone and logs one info line to the console.
