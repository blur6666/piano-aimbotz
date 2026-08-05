import type { SubmitRun } from '../../shared/contracts.js'

export type SubmitRunResponse = {
  run: {
    id: number
    exerciseId: number
    firstExpectedBeatAtMs: number
    tempoBpm: number
  }
  originalAssessment: {
    summary: {
      hardFaultCount: number
      timingFaultCount: number
      overlapFaultCount: number
      passed: boolean
    }
  }
  progress: {
    exerciseId: number
    initialTempoBpm: number
    currentTempoBpm: number
    consecutiveCleanRuns: number
  }
}

export async function submitRun(
  payload: SubmitRun
): Promise<SubmitRunResponse> {
  const response = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await response.json()
  if (!response.ok)
    throw new Error(
      (data as { error?: { message: string } }).error?.message ??
        'Could not save the run.'
    )
  return data as SubmitRunResponse
}
