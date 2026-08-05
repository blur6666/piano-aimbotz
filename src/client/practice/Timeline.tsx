import { useEffect, useRef, useState } from 'react'
import type { AssessmentStep } from '../api/runs.js'
import { readableMidiNote } from '../midi/format.js'

export type LiveNote = {
  midiPitch: number
  offsetUs: number
}

export type TimelineProps = {
  steps: Array<{ noteSpelling: string }>
  beatMs: number
  running: boolean
  firstExpectedBeat: number | null
  liveNotes: LiveNote[]
  finalSteps: AssessmentStep[] | null
}

// Best-effort live visualizer (BACKLOG.md): a laser sweeps left to right in
// sync with the metronome clock while a run is in progress, and raw note-on
// events appear approximately where they landed. Audio/visual sync over
// Web MIDI + requestAnimationFrame is inherently approximate, so once the
// server's real per-step assessment comes back, `finalSteps` supersedes the
// live markers with the actual anchored/matched timing -- the accurate
// picture always wins over the live guess.
//
// A pad's horizontal center is "perfect timing" for that step, matching
// the spec's chosen reference point. Total strip width spans 8 pads (one
// beatMs each), pad i centered at firstExpectedBeat + i*beatMs.
export function Timeline({
  steps,
  beatMs,
  running,
  firstExpectedBeat,
  liveNotes,
  finalSteps
}: TimelineProps) {
  const laserRef = useRef<HTMLDivElement>(null)
  const [laserFraction, setLaserFraction] = useState(0)

  useEffect(() => {
    if (!running || firstExpectedBeat === null || beatMs <= 0) return
    let frame: number
    const totalMs = 8 * beatMs
    const tick = () => {
      const elapsedMs = performance.now() - firstExpectedBeat
      const fraction = clamp01((elapsedMs + beatMs / 2) / totalMs)
      if (laserRef.current)
        laserRef.current.style.left = `${fraction * 100}%`
      setLaserFraction(fraction)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [running, firstExpectedBeat, beatMs])

  const totalMs = 8 * beatMs
  const fractionForOffsetUs = (offsetUs: number) =>
    clamp01((offsetUs / 1000 + beatMs / 2) / totalMs)

  const markers: Array<{
    key: string
    fraction: number
    label: string
    kind: 'live' | 'hit' | 'miss'
  }> = finalSteps
    ? finalSteps.map((step, index) => ({
        key: `final-${index}`,
        fraction: step.missed
          ? (index + 0.5) / 8
          : fractionForOffsetUs(
              index * beatMs * 1000 + (step.timingDeviationUs ?? 0)
            ),
        label: steps[index]?.noteSpelling ?? '?',
        kind: step.missed ? 'miss' : 'hit'
      }))
    : liveNotes.map((note, index) => ({
        key: `live-${index}`,
        fraction: fractionForOffsetUs(note.offsetUs),
        label: readableMidiNote(note.midiPitch),
        kind: 'live'
      }))

  return (
    <div className="timeline" aria-hidden="true">
      <div className="timeline-pads">
        {steps.map((step, index) => (
          <div className="timeline-pad" key={index}>
            <span>{step.noteSpelling}</span>
          </div>
        ))}
      </div>
      <div className="timeline-track">
        {steps.map((_, index) => (
          <div
            key={`target-${index}`}
            className="timeline-target"
            style={{ left: `${((index + 0.5) / 8) * 100}%` }}
          />
        ))}
        {running && (
          <div
            ref={laserRef}
            className="timeline-laser"
            style={{ left: `${laserFraction * 100}%` }}
          />
        )}
        {markers.map((marker) => (
          <div
            key={marker.key}
            className={`timeline-marker timeline-marker-${marker.kind}`}
            style={{ left: `${marker.fraction * 100}%` }}
            title={marker.label}
          />
        ))}
      </div>
    </div>
  )
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
