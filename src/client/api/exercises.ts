import type { Exercise, ExerciseListResponse } from '../../shared/contracts.js'

export type SelectableExercise = Exercise & {
  scaleSlug: string
  scaleDisplayName: string
  label: string
}

export async function fetchExercises(): Promise<SelectableExercise[]> {
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
  return exercises
}
