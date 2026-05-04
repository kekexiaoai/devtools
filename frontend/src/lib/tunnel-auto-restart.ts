const retryDelaysMs = [5000, 15000, 30000] as const

export interface AutoRestartPlan {
  attempts: number
  delayMs: number
  exhausted: boolean
}

export interface TunnelAutoRestartState {
  attempts: number
  nextRetryAt?: number
  exhausted: boolean
}

export function getNextAutoRestartPlan(
  previousAttempts: number
): AutoRestartPlan {
  if (previousAttempts >= retryDelaysMs.length) {
    return {
      attempts: retryDelaysMs.length,
      delayMs: 0,
      exhausted: true,
    }
  }

  return {
    attempts: previousAttempts + 1,
    delayMs: retryDelaysMs[previousAttempts],
    exhausted: false,
  }
}
