import { describe, expect, it } from 'vitest'
import { getNextAutoRestartPlan } from './tunnel-auto-restart'

describe('getNextAutoRestartPlan', () => {
  it('schedules the first retry after 5 seconds', () => {
    expect(getNextAutoRestartPlan(0)).toEqual({
      attempts: 1,
      delayMs: 5000,
      exhausted: false,
    })
  })

  it('uses increasing delays for later retries', () => {
    expect(getNextAutoRestartPlan(1)).toMatchObject({
      attempts: 2,
      delayMs: 15000,
    })
    expect(getNextAutoRestartPlan(2)).toMatchObject({
      attempts: 3,
      delayMs: 30000,
    })
  })

  it('marks the plan exhausted after the maximum retry count', () => {
    expect(getNextAutoRestartPlan(3)).toEqual({
      attempts: 3,
      delayMs: 0,
      exhausted: true,
    })
  })
})
