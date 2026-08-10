import type { SubmitRun } from '../../shared/contracts.js'

export type AssessmentStep = {
  stepIndex: number
  expectedMidiPitch: number | null
  matchedEventSequenceNumber: number | null
  hardFaultCount: number
  missed: boolean
  timingDeviationUs: number | null
  timingExcluded: boolean
  timingFault: boolean
  overlapDurationUs: number | null
  overlapReleaseMissing: boolean
  overlapFault: boolean
}

export type ScoringParameters = {
  timingToleranceNoteFraction: number
  overlapToleranceUs: number
  maxTimingFaultsPerRun: number
  recoveryWindowSteps: number
}

export type AssessmentFault = {
  type: 'wrong_pitch' | 'duplicate' | 'missed' | 'extra'
  stepIndex: number
  eventSequenceNumber: number | null
}

export type SubmitRunResponse = {
  run: {
    id: number
    exerciseId: number
    firstExpectedBeatAtMs: number
    tempoBpm: number
  }
  originalAssessment: {
    scoringParameters: ScoringParameters
    // `timingToleranceBeatFraction` resolved against this run's tempo.
    timingToleranceUs: number
    steps: AssessmentStep[]
    faults: AssessmentFault[]
    summary: {
      hardFaultCount: number
      timingFaultCount: number
      overlapFaultCount: number
      timingSampleCount: number
      timingExcludedCount: number
      meanAbsoluteTimingDeviationUs: number | null
      timingStartOffsetUs: number | null
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

export type RunHistoryEntry = {
  id: number
  firstExpectedBeatAtMs: number
  tempoBpm: number
  originalAssessment: {
    algorithmVersion: string
    hardFaultCount: number
    timingFaultCount: number
    overlapFaultCount: number
    timingSampleCount: number
    timingExcludedCount: number
    meanAbsoluteTimingDeviationUs: number | null
    timingStartOffsetUs: number | null
    passed: boolean
  }
}

export type ProgressionParameters =
  | {
      cleanRunsRequired: number
      tempoIncrementBpm: number
      failedRunBehavior: 'reset_streak'
    }
  | {
      cleanRunsRequired: number
      tempoIncrementBpm: number
      failedRunBehavior: 'step_down'
      tempoDecrementBpm: number
      minimumTempoBpm: number
    }

export type RunDetail = {
  run: {
    id: number
    exerciseId: number
    firstExpectedBeatAtMs: number
    tempoBpm: number
  }
  originalAssessment: {
    algorithmVersion: string
    progressionPolicyVersion: string
    progressionParameters: ProgressionParameters
    assessedAtMs: number
    summary: RunHistoryEntry['originalAssessment']
  }
  currentAssessment: {
    algorithmVersion: string
    steps: AssessmentStep[]
    faults: AssessmentFault[]
    summary: RunHistoryEntry['originalAssessment']
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok)
    throw new Error(
      (data as { error?: { message: string } }).error?.message ??
        `Request to ${url} failed.`
    )
  return data
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

export async function fetchRunHistory(
  exerciseId: number
): Promise<RunHistoryEntry[]> {
  const data = (await fetchJson(`/api/runs?exerciseId=${exerciseId}`)) as {
    runs: RunHistoryEntry[]
  }
  return data.runs
}

export async function fetchRunDetail(runId: number): Promise<RunDetail> {
  return (await fetchJson(`/api/runs/${runId}`)) as RunDetail
}
