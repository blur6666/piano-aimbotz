import React, { useEffect, useRef } from 'react'
import {
  Annotation,
  AnnotationVerticalJustify,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  Voice
} from 'vexflow'
import type { ExerciseStep } from '../../shared/contracts.js'

export type ScoreStaffProps = {
  steps: readonly ExerciseStep[]
  direction: 'ascending' | 'descending'
  scaleSlug?: string
  activeStepIndex?: number | null
}

const SCALE_SLUG_TO_KEY_SIG: Record<string, string> = {
  'c-major': 'C',
  'g-major': 'G',
  'd-major': 'D',
  'a-major': 'A',
  'e-major': 'E',
  'b-major': 'B',
  'f-major': 'F',
  'b-flat-major': 'Bb',
  'e-flat-major': 'Eb',
  'a-flat-major': 'Ab',
  'd-flat-major': 'Db',
  'g-flat-major': 'Gb'
}

const PITCH_CLASS_BY_SPELLING: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11
}

export function ScoreStaff({
  steps,
  direction,
  scaleSlug,
  activeStepIndex
}: ScoreStaffProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || steps.length === 0) return

    container.innerHTML = ''

    const width = Math.max(container.clientWidth || 700, 500)
    const height = 140

    const renderer = new Renderer(container, Renderer.Backends.SVG)
    renderer.resize(width, height)
    const context = renderer.getContext()

    context.setFont('ui-sans-serif, sans-serif', 12)
    context.setFillStyle('#e7e7e5')
    context.setStrokeStyle('#666666')

    const stave = new Stave(10, 10, width - 20)
    stave.addClef('treble')

    const keySig = scaleSlug ? SCALE_SLUG_TO_KEY_SIG[scaleSlug] : undefined
    if (keySig) stave.addKeySignature(keySig)

    stave.setContext(context).draw()

    const ascending = direction === 'ascending'
    let octave = 4
    let previousPitchClass: number | null = null

    const staveNotes = steps.map((step) => {
      const pitchClass = PITCH_CLASS_BY_SPELLING[step.noteSpelling] ?? 0
      if (previousPitchClass !== null) {
        if (ascending && pitchClass <= previousPitchClass) octave += 1
        else if (!ascending && pitchClass >= previousPitchClass) octave -= 1
      }
      previousPitchClass = pitchClass

      const letter = step.noteSpelling.charAt(0).toLowerCase()
      const accidental =
        step.noteSpelling.length > 1 ? step.noteSpelling.slice(1) : ''
      const noteKey = `${letter}${accidental}/${octave}`

      const staveNote = new StaveNote({
        keys: [noteKey],
        duration: 'q',
        clef: 'treble'
      })

      const isCurrent = activeStepIndex === step.stepIndex
      if (isCurrent) {
        staveNote.setStyle({ fillStyle: '#f7d58b', strokeStyle: '#f7d58b' })
      } else {
        staveNote.setStyle({ fillStyle: '#e7e7e5', strokeStyle: '#c9c9c6' })
      }

      const annotation = new Annotation(
        String(step.fingerNumber)
      ).setVerticalJustification(AnnotationVerticalJustify.BOTTOM)
      annotation.setFont('ui-sans-serif, sans-serif', 11)
      if (isCurrent) {
        annotation.setStyle({ fillStyle: '#f7d58b' })
      } else {
        annotation.setStyle({ fillStyle: '#a8a8a5' })
      }
      staveNote.addModifier(annotation)

      return staveNote
    })

    const voice = new Voice({
      numBeats: steps.length,
      beatValue: 4
    })
    voice.addTickables(staveNotes)

    new Formatter().joinVoices([voice]).format([voice], width - 100)
    voice.draw(context, stave)
  }, [steps, direction, scaleSlug, activeStepIndex])

  return (
    <div className="score-staff-wrapper">
      <div ref={containerRef} className="score-staff-canvas" />
    </div>
  )
}
