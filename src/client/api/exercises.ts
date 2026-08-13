import type { Exercise, ExerciseListResponse } from '../../shared/contracts.js'

export type SelectableExercise = Exercise & {
  scaleSlug: string
  scaleDisplayName: string
  label: string
}

export type ExerciseCatalog = {
  // Flattened, but still in the server's progression order: the trail order
  // is the recommendation (docs/SPEC.md), so nothing here re-sorts.
  exercises: SelectableExercise[]
  // Which scale to work on now, or null once every scale is cleared. The
  // server decides it; the browser only renders it.
  recommendedScaleSlug: string | null
}

export async function fetchExercises(): Promise<ExerciseCatalog> {
  const response = await fetch('/api/exercises')
  if (!response.ok) throw new Error('The exercise catalog is not seeded.')
  const data = (await response.json()) as ExerciseListResponse
  const exercises: SelectableExercise[] = []
  for (const group of data.groups)
    for (const scale of group.scales)
      for (const exercise of scale.exercises)
        exercises.push({
          ...exercise,
          scaleSlug: scale.slug,
          scaleDisplayName: scale.displayName,
          label:
            exercise.octaves === 1
              ? `${scale.displayName} ${exercise.direction}`
              : `${scale.displayName} ${exercise.direction} (${exercise.octaves} octaves)`
        })
  return { exercises, recommendedScaleSlug: data.recommendedScaleSlug }
}
