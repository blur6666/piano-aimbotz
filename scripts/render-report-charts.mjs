// Renders the SVG figures embedded in reports/001-midi-latency/REPORT.md.
//
//   npm run report:charts
//
// Reads the committed CSVs under the report's data/ directory -- never
// piano.db, which is gitignored. That is deliberate: the figures must be
// reproducible from a fresh clone with no local database. Use
// `npm run report:data` to regenerate those CSVs from piano.db.
//
// Every figure is emitted twice, once per colour mode, because the report is
// read on GitHub where a <picture> element picks the variant. The dark steps
// are chosen from the palette's dark column -- they are not an automatic
// inversion of the light ones.
//
// No plotting dependency on purpose: the dataset is 168 points, so a charting
// library would cost more than the ~150 lines of geometry it replaces.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPORT = join(ROOT, 'reports', '001-midi-latency')
const OUT = join(REPORT, 'charts')

// Palette slots taken from the data-viz reference palette. The pair
// (series, critical) was validated with scripts/validate_palette.js in both
// modes: all checks pass, worst CVD dE 23.8 light / 25.7 dark.
const THEMES = {
  light: {
    surface: '#fcfcfb',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    series: '#2a78d6',
    critical: '#d03b3b',
    bandFill: '#0b0b0b',
    bandOpacity: 0.035
  },
  dark: {
    surface: '#1a1a19',
    ink: '#ffffff',
    ink2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    series: '#3987e5',
    critical: '#d03b3b',
    bandFill: '#ffffff',
    bandOpacity: 0.05
  }
}

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif"
const TOLERANCE_FRACTION = 0.2

// ---------------------------------------------------------------- data

function readCsv(name) {
  const lines = readFileSync(join(REPORT, 'data', name), 'utf8').trim().split('\n')
  const columns = lines[0].split(',')
  return lines.slice(1).map((line) => {
    // Fields are only quoted when they contain a comma, quote, or newline.
    const cells = []
    let cell = ''
    let quoted = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1 }
        else if (ch === '"') quoted = false
        else cell += ch
      } else if (ch === '"') quoted = true
      else if (ch === ',') { cells.push(cell); cell = '' }
      else cell += ch
    }
    cells.push(cell)
    return Object.fromEntries(columns.map((c, i) => [c, cells[i]]))
  })
}

function loadRuns() {
  const runs = readCsv('runs.csv').map((r) => ({
    id: Number(r.run_id),
    bpm: Number(r.tempo_bpm),
    npb: Number(r.notes_per_beat)
  }))
  const events = readCsv('midi-events.csv')
    .filter((e) => e.event_type === 'note_on')
    .map((e) => ({
      run_id: Number(e.run_id),
      offset_us: Number(e.offset_us)
    }))
    .sort((a, b) => a.run_id - b.run_id || a.offset_us - b.offset_us)

  return runs.map((run) => {
    const intervalMs = 60_000 / (run.bpm * run.npb)
    const onsets = events
      .filter((e) => e.run_id === run.id)
      .map((e) => e.offset_us / 1000)
    const notes = onsets.map((onsetMs, step) => ({
      step,
      onsetMs,
      deviationMs: onsetMs - Math.round(step * intervalMs * 1000) / 1000
    }))
    const fit = leastSquares(notes.map((n) => n.step), onsets)
    return {
      id: run.id,
      bpm: run.bpm,
      intervalMs,
      toleranceMs: intervalMs * TOLERANCE_FRACTION,
      // Inter-onset interval as a percentage of nominal. This is the measure
      // that exposes the fingering: it is local, so unlike deviation-from-grid
      // it does not carry the whole run's accumulated offset into every note.
      ioiPercent: onsets
        .slice(1)
        .map((onsetMs, i) => ((onsetMs - onsets[i]) / intervalMs) * 100),
      notes: notes.map((n) => ({
        ...n,
        residualMs: n.onsetMs - (fit.intercept + fit.slope * n.step)
      })),
      interceptMs: fit.intercept,
      tempoErrorPct: ((fit.slope - intervalMs) / intervalMs) * 100,
      meanDeviationMs:
        notes.reduce((sum, n) => sum + n.deviationMs, 0) / notes.length
    }
  })
}

function leastSquares(xs, ys) {
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = num / den
  return { slope, intercept: my - slope * mx }
}

// ---------------------------------------------------------------- svg helpers

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)

function text(x, y, content, opts = {}) {
  const {
    fill,
    size = 12,
    weight = 400,
    anchor = 'start',
    baseline = 'auto',
    tabular = false
  } = opts
  return (
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" ` +
    `font-family="${FONT}" font-size="${size}" font-weight="${weight}" ` +
    `text-anchor="${anchor}" dominant-baseline="${baseline}"` +
    (tabular ? ' style="font-variant-numeric: tabular-nums"' : '') +
    `>${esc(content)}</text>`
  )
}

// Hairline, solid, one step off the surface -- never dashed.
const gridLine = (x1, y1, x2, y2, stroke) =>
  `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" ` +
  `y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="1"/>`

// Markers carry a 2px ring in the surface colour so they stay legible where
// they overlap each other or cross the line.
const dot = (cx, cy, r, fill, ring, opacity = 1) =>
  `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}" ` +
  (ring ? `stroke="${ring}" stroke-width="2" ` : '') +
  (opacity < 1 ? `opacity="${opacity}" ` : '') +
  '/>'

function frame({ width, height, theme, title, subtitle, body, desc }) {
  const t = THEMES[theme]
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title><desc>${esc(desc)}</desc>` +
    `<rect width="${width}" height="${height}" fill="${t.surface}"/>` +
    text(28, 34, title, { fill: t.ink, size: 16, weight: 600 }) +
    text(28, 55, subtitle, { fill: t.ink2, size: 12.5 }) +
    body +
    '</svg>'
  )
}

// ---------------------------------------------------------------- figure 1

function figureOffsetPerAttempt(runs, theme) {
  const t = THEMES[theme]
  const width = 760
  const height = 396
  const plot = { left: 58, right: width - 28, top: 108, bottom: height - 52 }

  const x = scale(0, runs.length - 1, plot.left, plot.right)
  const y = scale(0, 90, plot.bottom, plot.top)

  let body = ''

  // Tempo blocks as background bands -- annotation, not a series, so they use
  // ink at low opacity rather than a categorical hue.
  const blocks = []
  runs.forEach((run, i) => {
    const last = blocks.at(-1)
    if (last && last.bpm === run.bpm) last.end = i
    else blocks.push({ bpm: run.bpm, start: i, end: i })
  })
  blocks.forEach((block, bi) => {
    const x0 = x(block.start) - (block.start === 0 ? 22 : 14)
    const x1 = x(block.end) + (block.end === runs.length - 1 ? 22 : 14)
    if (bi % 2 === 1) {
      body +=
        `<rect x="${x0.toFixed(1)}" y="${plot.top - 20}" width="${(x1 - x0).toFixed(1)}" ` +
        `height="${plot.bottom - plot.top + 20}" fill="${t.bandFill}" opacity="${t.bandOpacity}"/>`
    }
    body += text((x0 + x1) / 2, plot.top - 28, `${block.bpm} bpm`, {
      fill: t.muted,
      size: 11.5,
      weight: 600,
      anchor: 'middle'
    })
  })

  for (let v = 0; v <= 90; v += 30) {
    body += gridLine(plot.left, y(v), plot.right, y(v), t.grid)
    body += text(plot.left - 10, y(v), String(v), {
      fill: t.muted,
      size: 11,
      anchor: 'end',
      baseline: 'middle',
      tabular: true
    })
  }
  body += gridLine(plot.left, plot.bottom, plot.right, plot.bottom, t.axis)

  const points = runs.map((run, i) => [x(i), y(run.interceptMs)])
  body +=
    `<polyline fill="none" stroke="${t.series}" stroke-width="2" ` +
    `stroke-linejoin="round" stroke-linecap="round" points="` +
    points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ') +
    '"/>'

  runs.forEach((run, i) => {
    body += dot(x(i), y(run.interceptMs), 4, t.series, t.surface)
    body += text(x(i), plot.bottom + 18, String(run.id), {
      fill: t.muted,
      size: 10,
      anchor: 'middle',
      tabular: true
    })
  })

  // Label selectively: the three block-opening highs that are the story, plus
  // the settled low. Never a number on every point.
  const marks = [
    { index: 0, dy: -16, anchor: 'middle' },
    { index: 12, dy: -16, anchor: 'middle' },
    { index: 16, dy: -16, anchor: 'middle' },
    // Sits in the open interior of the V rather than below, where it would
    // collide with the run-id tick row.
    { index: 15, dy: -17, anchor: 'middle' }
  ]
  marks.forEach(({ index, dy, anchor }) => {
    const run = runs[index]
    body += text(x(index), y(run.interceptMs) + dy, `${Math.round(run.interceptMs)} ms`, {
      fill: t.ink,
      size: 11.5,
      weight: 600,
      anchor,
      baseline: 'middle',
      tabular: true
    })
  })

  body += text(28, plot.top - 28, 'ms late', { fill: t.muted, size: 11 })
  body += text((plot.left + plot.right) / 2, height - 16, 'run id', {
    fill: t.muted,
    size: 11,
    anchor: 'middle'
  })

  return frame({
    width,
    height,
    theme,
    title: 'Start offset resets at every tempo change',
    subtitle:
      'Fitted per-run start offset. Decays ~3.9 ms per attempt (r = -0.56), then jumps back on a new tempo.',
    desc:
      'Line chart of fitted start offset in milliseconds for runs 1 to 21, ' +
      'grouped into 80, 84 and 88 bpm blocks. Each block begins near 80 ms and decays.',
    body
  })
}

// ---------------------------------------------------------------- figure 2

function figureStepProfile(runs, theme) {
  const t = THEMES[theme]
  const width = 760
  const height = 416
  const plot = { left: 58, right: width - 118, top: 108, bottom: height - 52 }

  const x = scale(0, 7, plot.left + 24, plot.right - 24)
  const y = scale(-60, 150, plot.bottom, plot.top)

  let body = ''
  for (let v = -60; v <= 150; v += 30) {
    const isZero = v === 0
    body += gridLine(plot.left, y(v), plot.right, y(v), isZero ? t.axis : t.grid)
    body += text(plot.left - 10, y(v), String(v), {
      fill: t.muted,
      size: 11,
      anchor: 'end',
      baseline: 'middle',
      tabular: true
    })
  }

  // Beeswarm: nudge a point sideways only when it would collide with one
  // already placed in the same step column.
  const meanByStep = []
  for (let step = 0; step <= 7; step += 1) {
    const values = runs
      .map((r) => r.notes[step].deviationMs)
      .sort((a, b) => a - b)
    const placed = []
    values.forEach((value) => {
      const cy = y(value)
      let offset = 0
      while (placed.some((p) => Math.abs(p.cy - cy) < 6 && Math.abs(p.offset - offset) < 6)) {
        offset = offset > 0 ? -offset : -offset + 6
      }
      placed.push({ cy, offset })
      body += dot(x(step) + offset, cy, 2.5, t.series, null, 0.5)
    })
    meanByStep.push(values.reduce((a, b) => a + b, 0) / values.length)
  }

  body +=
    `<polyline fill="none" stroke="${t.series}" stroke-width="2" ` +
    `stroke-linejoin="round" stroke-linecap="round" points="` +
    meanByStep.map((m, s) => `${x(s).toFixed(1)},${y(m).toFixed(1)}`).join(' ') +
    '"/>'
  meanByStep.forEach((m, s) => {
    body += dot(x(s), y(m), 4.5, t.series, t.surface)
    body += text(x(s), plot.bottom + 18, String(s), {
      fill: t.muted,
      size: 11,
      anchor: 'middle',
      tabular: true
    })
  })

  // One direct label at the line end identifies the mean track; the pale dots
  // behind it are the individual notes.
  body += text(x(7) + 12, y(meanByStep[7]), 'mean', {
    fill: t.ink,
    size: 11.5,
    weight: 600,
    baseline: 'middle'
  })
  body += text(x(7) + 12, y(meanByStep[7]) + 15, '168 notes', {
    fill: t.muted,
    size: 10.5,
    baseline: 'middle'
  })

  body += text(28, plot.top - 28, 'ms vs grid', { fill: t.muted, size: 11 })
  body += text((plot.left + plot.right) / 2, height - 16, 'step index', {
    fill: t.muted,
    size: 11,
    anchor: 'middle'
  })

  return frame({
    width,
    height,
    theme,
    title: 'Every note is late, and the middle of the scale is latest',
    subtitle:
      'Deviation from the grid by step, all 21 runs. Drag peaks at step 2-4, then the last notes rush back.',
    desc:
      'Beeswarm of 168 note deviations by step index 0 to 7 with a mean line, ' +
      'rising from about 22 ms at step 0 to 69 ms at step 4 and falling to 30 ms at step 7.',
    body
  })
}

// ---------------------------------------------------------------- figure 3

function figureBeforeAfter(runs, theme) {
  const t = THEMES[theme]
  const width = 880
  const height = 580
  const top = 118
  const bottom = height - 58
  const panelWidth = 356
  const panels = [
    { x0: 58, key: 'deviationMs', label: 'As scored now (absolute grid)' },
    { x0: 58 + panelWidth + 52, key: 'residualMs', label: "Minus each run's best-fit line" }
  ]

  const y = scale(0, runs.length - 1, top, bottom)
  let body = ''

  panels.forEach((panel) => {
    const x = scale(-150, 150, panel.x0, panel.x0 + panelWidth)
    body += text(panel.x0 + panelWidth / 2, top - 46, panel.label, {
      fill: t.ink,
      size: 12.5,
      weight: 600,
      anchor: 'middle'
    })

    // Gridlines mark the full extent, but only the inner three are labelled --
    // the outer pair would put "150" and "-150" side by side in the gutter
    // between the panels and read as one number.
    for (const v of [-150, -75, 0, 75, 150]) {
      body += gridLine(x(v), top - 22, x(v), bottom + 8, v === 0 ? t.axis : t.grid)
      if (Math.abs(v) === 150) continue
      body += text(x(v), bottom + 24, String(v), {
        fill: t.muted,
        size: 10.5,
        anchor: 'middle',
        tabular: true
      })
    }

    runs.forEach((run, i) => {
      // The tolerance window narrows with tempo, so it is drawn per run.
      body +=
        `<rect x="${x(-run.toleranceMs).toFixed(1)}" y="${(y(i) - 7).toFixed(1)}" ` +
        `width="${(x(run.toleranceMs) - x(-run.toleranceMs)).toFixed(1)}" height="14" ` +
        `rx="4" fill="${t.bandFill}" opacity="${t.bandOpacity}"/>`
      run.notes.forEach((note) => {
        const value = note[panel.key]
        const fault = Math.abs(value) > run.toleranceMs
        body += dot(x(value), y(i), 3.4, fault ? t.critical : t.series, t.surface, 1)
      })
    })
  })

  runs.forEach((run, i) => {
    body += text(panels[0].x0 - 12, y(i), String(run.id), {
      fill: t.muted,
      size: 10.5,
      anchor: 'end',
      baseline: 'middle',
      tabular: true
    })
  })
  body += text(panels[0].x0 - 12, top - 22, 'run', {
    fill: t.muted,
    size: 10.5,
    anchor: 'end'
  })

  // Two classes on screen, so a legend is present; the tolerance band gives
  // the same information positionally, so identity is never colour-alone.
  const legendY = height - 22
  let lx = panels[0].x0
  const legend = [
    { color: t.series, label: 'within tolerance' },
    { color: t.critical, label: 'timing fault' }
  ]
  legend.forEach((item) => {
    body += dot(lx + 5, legendY - 4, 4, item.color, t.surface)
    body += text(lx + 16, legendY, item.label, {
      fill: t.ink2,
      size: 11,
      baseline: 'alphabetic'
    })
    lx += 22 + item.label.length * 6.1
  })
  body += text(lx + 14, legendY, 'shaded band = ±0.20 note-interval window', {
    fill: t.muted,
    size: 11
  })
  body += text(panels[1].x0 + panelWidth, legendY, 'deviation, ms', {
    fill: t.muted,
    size: 11,
    anchor: 'end'
  })

  return frame({
    width,
    height,
    theme,
    title: "Scoring against each run's best-fit line clears 11 of the 12 failing runs",
    subtitle:
      'Per-note deviation against the tolerance window, before and after removing the run\'s own offset and tempo. Same scale in both panels, in ms.',
    desc:
      'Two dot-strip panels, one row per run. The left panel shows raw deviations with ' +
      '35 notes outside the tolerance band; the right shows residuals after removing each ' +
      "run's best-fit line, with only 1 outside.",
    body
  })
}

// ---------------------------------------------------------------- figure 4

// Emphasis, not categorical: the crossing is the story and every other
// transition is context, so one accent hue carries it and the rest go grey.
// Colouring all seven would bury the point under a rainbow.
function figureCrossing(runs, theme) {
  const t = THEMES[theme]
  const steps = readCsv('exercise-steps.csv')
  const width = 800
  const height = 448
  const plot = { left: 62, right: width - 28, top: 122, bottom: height - 76 }

  const x = scale(0, 6, plot.left + 40, plot.right - 40)
  // Domain covers the full observed range (77.1 - 119.8); nothing is clipped.
  const y = scale(75, 122, plot.bottom, plot.top)

  // A transition is the crossing when the finger number falls instead of
  // rising -- the thumb has passed under the hand.
  const transitions = steps.slice(1).map((step, i) => {
    const from = Number(steps[i].finger_number)
    const to = Number(step.finger_number)
    return {
      label: `${steps[i].note_spelling}→${step.note_spelling}`,
      fingers: `${from}→${to}`,
      crossing: to < from,
      values: runs.map((r) => r.ioiPercent[i])
    }
  })
  // The note leading into the crossing is where the hand prepares, so it is
  // part of the same event and shares the emphasis.
  const crossingIndex = transitions.findIndex((tr) => tr.crossing)
  transitions.forEach((tr, i) => {
    tr.highlighted = i === crossingIndex || i === crossingIndex - 1
  })

  let body = ''
  for (let v = 80; v <= 120; v += 10) {
    body += gridLine(plot.left, y(v), plot.right, y(v), t.grid)
    body += text(plot.left - 10, y(v), `${v}%`, {
      fill: t.muted,
      size: 11,
      anchor: 'end',
      baseline: 'middle',
      tabular: true
    })
  }
  // On-tempo is the reference the whole chart is read against.
  body += gridLine(plot.left, y(100), plot.right, y(100), t.axis)

  transitions.forEach((tr, i) => {
    const colour = tr.highlighted ? t.series : t.muted
    const placed = []
    ;[...tr.values].sort((a, b) => a - b).forEach((value) => {
      const cy = y(value)
      let offset = 0
      while (placed.some((p) => Math.abs(p.cy - cy) < 6 && Math.abs(p.offset - offset) < 6)) {
        offset = offset > 0 ? -offset : -offset + 6
      }
      placed.push({ cy, offset })
      body += dot(x(i) + offset, cy, 2.5, colour, null, tr.highlighted ? 0.5 : 0.38)
    })
    const mean = tr.values.reduce((a, b) => a + b, 0) / tr.values.length
    body += dot(x(i), y(mean), 4.5, colour, t.surface)

    body += text(x(i), plot.bottom + 22, tr.label, {
      fill: tr.highlighted ? t.ink : t.muted,
      size: 12,
      weight: tr.highlighted ? 600 : 400,
      anchor: 'middle'
    })
    body += text(x(i), plot.bottom + 39, tr.fingers, {
      fill: t.muted,
      size: 11,
      anchor: 'middle',
      tabular: true
    })
  })

  // Bracket over the two transitions that make up the crossing event.
  const x0 = x(crossingIndex - 1) - 26
  const x1 = x(crossingIndex) + 26
  const braceY = plot.top - 26
  body +=
    `<path d="M ${x0.toFixed(1)} ${braceY + 7} L ${x0.toFixed(1)} ${braceY} ` +
    `L ${x1.toFixed(1)} ${braceY} L ${x1.toFixed(1)} ${braceY + 7}" ` +
    `fill="none" stroke="${t.axis}" stroke-width="1"/>`
  body += text((x0 + x1) / 2, braceY - 8, 'thumb passes under', {
    fill: t.ink,
    size: 12,
    weight: 600,
    anchor: 'middle'
  })

  const approach = transitions[crossingIndex - 1]
  const cross = transitions[crossingIndex]
  const meanOf = (tr) => tr.values.reduce((a, b) => a + b, 0) / tr.values.length
  body += text(x(crossingIndex - 1) - 30, y(meanOf(approach)), 'drags 8.4%', {
    fill: t.ink,
    size: 11.5,
    weight: 600,
    anchor: 'end',
    baseline: 'middle'
  })
  body += text(x(crossingIndex) + 30, y(meanOf(cross)) + 4, 'widest spread', {
    fill: t.ink,
    size: 11.5,
    weight: 600,
    baseline: 'middle'
  })

  body += text(28, plot.top - 52, 'inter-onset interval, % of nominal', {
    fill: t.muted,
    size: 11
  })
  body += text(plot.left, height - 16, 'each dot is one run; large dot is the mean of 21', {
    fill: t.muted,
    size: 11
  })

  return frame({
    width,
    height,
    theme,
    title: 'The scale hesitates before the thumb crossing, then gambles through it',
    subtitle:
      'Every transition in C major ascending. D→E and G→A are the same finger move (2→3); only D→E leads into the crossing.',
    desc:
      'Beeswarm of inter-onset intervals for the seven transitions. D to E averages ' +
      '108.4 percent of nominal, E to F (the thumb crossing) averages 98.6 percent with ' +
      'the widest spread of any transition, and the remaining transitions sit near 100.',
    body
  })
}

// ---------------------------------------------------------------- main

const runs = loadRuns()
mkdirSync(OUT, { recursive: true })

const figures = [
  ['offset-per-attempt', figureOffsetPerAttempt],
  ['step-profile', figureStepProfile],
  ['before-after-correction', figureBeforeAfter],
  ['crossing-by-transition', figureCrossing]
]

for (const [name, render] of figures) {
  for (const theme of ['light', 'dark']) {
    const file = join(OUT, `${name}-${theme}.svg`)
    writeFileSync(file, render(runs, theme))
    console.log('wrote', file.slice(ROOT.length + 1))
  }
}

const faults = (key) =>
  runs.reduce(
    (sum, r) =>
      sum + r.notes.filter((n) => Math.abs(n[key]) > r.toleranceMs).length,
    0
  )
const clean = (key) =>
  runs.filter((r) => r.notes.every((n) => Math.abs(n[key]) > r.toleranceMs === false))
    .length

console.log(
  `\n${runs.length} runs, ${runs.length * 8} onsets\n` +
    `faulted notes: ${faults('deviationMs')} raw -> ${faults('residualMs')} corrected\n` +
    `clean runs:    ${clean('deviationMs')} raw -> ${clean('residualMs')} corrected`
)
