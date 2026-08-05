export type ExerciseSummary = {
  id: number
  name: string
  direction: 'ascending' | 'descending'
  currentTempoBpm: number
  consecutiveCleanRuns: number
  steps: Array<{
    stepIndex: number
    noteSpelling: string
    fingerNumber: number
  }>
}

export async function fetchExercises(): Promise<ExerciseSummary[]> {
  const response = await fetch('/api/exercises')
  if (!response.ok) throw new Error('The exercise catalog is not seeded.')
  const data = (await response.json()) as { exercises: ExerciseSummary[] }
  return data.exercises
}
