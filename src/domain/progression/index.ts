import {
  applyProgression as applyV1,
  POLICY_VERSION as v1
} from './versions/v1.js'
import type { ProgressionPolicy, ProgressionSnapshot } from './policy.js'

export type { ProgressionPolicy, ProgressionSnapshot } from './policy.js'

export const CURRENT_PROGRESSION_VERSION = v1

type Handler = (
  snapshot: ProgressionSnapshot,
  passed: boolean,
  policy: ProgressionPolicy
) => ProgressionSnapshot

const versionHandlers: Record<string, Handler> = {
  [v1]: applyV1
}

export function applyProgressionVersion(
  version: string,
  snapshot: ProgressionSnapshot,
  passed: boolean,
  policy: ProgressionPolicy
): ProgressionSnapshot {
  const handler = versionHandlers[version]
  if (!handler)
    throw new Error(
      `No registered progression handler for version "${version}"`
    )
  return handler(snapshot, passed, policy)
}

export type ReplayableAssessment = {
  passed: boolean
  progressionPolicyVersion: string
  progressionParameters: ProgressionPolicy
}

export function replayProgression(
  initialTempoBpm: number,
  orderedAssessments: ReplayableAssessment[]
): ProgressionSnapshot {
  let snapshot: ProgressionSnapshot = {
    currentTempoBpm: initialTempoBpm,
    consecutiveCleanRuns: 0
  }
  for (const assessment of orderedAssessments)
    snapshot = applyProgressionVersion(
      assessment.progressionPolicyVersion,
      snapshot,
      assessment.passed,
      assessment.progressionParameters
    )
  return snapshot
}
