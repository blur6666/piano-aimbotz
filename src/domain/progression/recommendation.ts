// Which scale the app tells the player to work on next (docs/SPEC.md,
// "Advancement rule"). Pure: no Fastify, no SQLite, no clock -- same
// discipline as the rest of src/domain/progression.
//
// This is a recommendation, never a gate. Nothing here locks an exercise or
// is consulted when a run is scored; the only consumer is the interface,
// which needs one scale to point at.

export type ExerciseDirection = 'ascending' | 'descending'

// The clear condition is a placeholder expected to move once there is real
// session data (docs/SPEC.md, "Advancement rule"), so it arrives as
// configuration rather than being written into the logic below.
export type RecommendationConfig = {
  // Which octave count gates. Other octave counts stay playable and are
  // simply not consulted here.
  clearOctaves: number
  // Which directions must have advanced. Both, by the current guess.
  clearDirections: readonly ExerciseDirection[]
}

export type RecommendationExercise = {
  direction: ExerciseDirection
  octaves: number
  initialTempoBpm: number
  currentTempoBpm: number
}

export type RecommendationScale = {
  slug: string
  exercises: readonly RecommendationExercise[]
}

// "Has this exercise ever advanced?" is the weakest honest signal available
// from stored progress, and deliberately so. The consecutive-clean-run streak
// cannot answer it: applyProgression resets the streak to zero on the very
// run that raises the tempo, so a freshly advanced exercise and one that has
// never been played are both sitting at zero. Tempo above the immutable seed
// value is the only thing that distinguishes them.
function hasAdvanced(exercise: RecommendationExercise): boolean {
  return exercise.currentTempoBpm > exercise.initialTempoBpm
}

export function isScaleCleared(
  scale: RecommendationScale,
  config: RecommendationConfig
): boolean {
  // Every required direction must be present *and* advanced. A missing
  // exercise is not a cleared one -- if the catalog does not offer the
  // gating variant, the scale simply never clears, which surfaces the
  // catalog gap instead of hiding it behind a cleared badge.
  return config.clearDirections.every((direction) => {
    const exercise = scale.exercises.find(
      (candidate) =>
        candidate.direction === direction &&
        candidate.octaves === config.clearOctaves
    )
    return exercise !== undefined && hasAdvanced(exercise)
  })
}

// `scalesInProgressionOrder` must already be ordered the way the catalog
// orders the trail: by group progression order, then position within the
// group. The ordering is the recommendation (docs/SPEC.md), so this function
// deliberately does not re-sort -- it would need the ordinals to do that, and
// duplicating the ordering rule here is exactly the second copy the schema
// avoids by deriving the trail from a view.
export function recommendNextScale(
  scalesInProgressionOrder: readonly RecommendationScale[],
  config: RecommendationConfig
): string | null {
  const next = scalesInProgressionOrder.find(
    (scale) => !isScaleCleared(scale, config)
  )
  // Null means every scale is cleared. The interface says so rather than
  // pointing at nothing.
  return next?.slug ?? null
}
