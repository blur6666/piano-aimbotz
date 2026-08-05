# Manual hardware acceptance checklist

CI does not attempt hardware MIDI automation (`ARCHITECTURE.md`, "Testing
strategy"). Browser-level MIDI emulation was rejected because it would test
a mock more than the hardware integration. This checklist is the
replacement: run it by hand, on real hardware, in the supported browser,
before trusting a change that touches MIDI capture, the metronome, or the
practice run flow.

## When to run this

- Before merging any change to `src/client/midi/`, `src/client/metronome/`,
  or `src/client/practice/`.
- Before merging any change to the `POST /api/runs` contract or its
  server-side handling.
- Periodically on the supported browser's stable channel, since Web MIDI
  behavior is a browser feature, not a pinned dependency.

## Environment

- Desktop Chromium-family browser (Chrome or Edge) with Web MIDI support.
- A real MIDI keyboard connected before opening the page. `access.ts` only
  enumerates inputs present at permission-grant time; this checklist does
  not cover hot-plugging.
- `npm run dev` + `npm run dev:client`, or `npm run start` — either
  topology is acceptable since both serve `/api` and the SPA from the
  documented origin.

## Checklist

1. **Permission**
   - [ ] Load the app. Click "Connect MIDI".
   - [ ] The browser's native Web MIDI permission prompt appears.
   - [ ] Denying the prompt leaves the status line showing a readable
     message (not a blank state or unhandled rejection in the console).
   - [ ] Reloading and granting permission recovers cleanly.

2. **Device selection**
   - [ ] After granting permission, the input `<select>` lists the
     connected keyboard by its real name (not just a raw device ID).
   - [ ] If more than one MIDI input is connected, all of them appear and
     each can be selected.
   - [ ] With zero inputs connected, the status line reads "No MIDI inputs
     found" rather than silently enabling Start.

3. **Audible count-in / click**
   - [ ] Pick an exercise, press "Start run". A 4-beat count-in is audible
     through the system's default audio output.
   - [ ] The on-screen beat label advances `Count-in: 1/4` → `4/4`, then
     into the scale beats (`Scale 1: 1/4` label style), then `Finishing`.
   - [ ] The click continues through all 8 expected notes, not just the
     count-in — this is a practice tool with the metronome always running,
     per `SPEC.md`.
   - [ ] Click timing sounds steady (no audible drift or stutter) across
     the whole run.

4. **Real keyboard capture**
   - [ ] Play the displayed scale and fingering on the physical keyboard
     during the run.
   - [ ] Notes played land at the expected beat visually/aurally (i.e. the
     click and your playing line up for a deliberately accurate run).
   - [ ] Play one deliberately wrong note during a run: the run still
     completes rather than aborting.
   - [ ] Play a note during the count-in: the run still completes and
     later shows a plausible fault against step 0 (early extra note), not
     a crash.
   - [ ] Hold a key past the next note-on (deliberate overlap) at least
     once: the run still completes.
   - [ ] Release every key before the capture window's tail beat ends
     (avoid a stuck note-off) at least once, to confirm normal completion.

5. **Successful submission**
   - [ ] After the capture window ends, the status line reports "Run
     saved" with a wrong-note count and updated tempo/streak — not an
     error.
   - [ ] The browser DevTools console shows exactly one `POST /api/runs`
     request for the run (Network tab), matching "a run is sent once,
     after its fixed capture window" (`ARCHITECTURE.md`).
   - [ ] The History panel for the exercise shows the new run immediately
     without a manual page reload.
   - [ ] Clicking the new history row expands per-step detail
     (expected pitch, matched event, deviation, flags) without errors.
   - [ ] Repeat the run once more immediately: the second submission also
     succeeds (rules out any one-shot-only bug in input/capture teardown).

## If something fails

File it as a bug with: browser + OS version, MIDI device model, the exact
step that failed, and the DevTools console/network output. Do not paper
over a hardware-integration failure with a client-side try/catch that
hides the underlying condition — fix the root cause or record it as a
known limitation here.
