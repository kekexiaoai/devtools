import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { debounce } from './utils'

// 我们使用 Vitest 的模拟计时器来控制测试中的时间流逝，而无需实际等待。
vi.useFakeTimers()

describe('debounce', () => {
  let func: Mock

  // 在每个测试用例运行前，重置模拟函数
  beforeEach(() => {
    func = vi.fn()
  })

  describe('默认行为 (trailing: true)', () => {
    it('应该在等待时间结束后只调用一次函数', () => {
      const debouncedFunc = debounce(func, 100)

      debouncedFunc()
      debouncedFunc()
      debouncedFunc()

      // 此时，函数不应该被调用
      expect(func).not.toHaveBeenCalled()

      // 快进时间 100ms
      vi.advanceTimersByTime(100)

      // 现在，函数应该被精确地调用了一次
      expect(func).toHaveBeenCalledTimes(1)
    })

    it('应该使用最后一次调用的参数', () => {
      const debouncedFunc = debounce(func, 100)

      debouncedFunc(1)
      debouncedFunc(2)
      debouncedFunc(3)

      vi.advanceTimersByTime(100)

      expect(func).toHaveBeenCalledWith(3)
      expect(func).toHaveBeenCalledTimes(1)
    })

    it('如果调用间隔大于等待时间，则多次调用', () => {
      const debouncedFunc = debounce(func, 100)

      debouncedFunc()
      vi.advanceTimersByTime(100)
      expect(func).toHaveBeenCalledTimes(1)

      debouncedFunc()
      vi.advanceTimersByTime(100)
      expect(func).toHaveBeenCalledTimes(2)
    })
  })

  describe('前沿触发 (leading: true)', () => {
    it('应该在第一次调用时立即执行', () => {
      const debouncedFunc = debounce(func, 100, { leading: true })

      debouncedFunc()
      expect(func).toHaveBeenCalledTimes(1)

      debouncedFunc()
      debouncedFunc()
      // 在等待时间内，不应再次调用
      expect(func).toHaveBeenCalledTimes(1)
    })

    it('在等待时间结束后，不应再次触发', () => {
      const debouncedFunc = debounce(func, 100, {
        leading: true,
        trailing: false, // 明确禁用后沿触发
      })

      debouncedFunc()
      expect(func).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      // 时间结束后，不应有额外的调用
      expect(func).toHaveBeenCalledTimes(1)
    })

    it('在冷却后，下一次调用应再次立即执行', () => {
      const debouncedFunc = debounce(func, 100, { leading: true })

      debouncedFunc() // 立即调用 #1
      expect(func).toHaveBeenCalledTimes(1)

      // 快进超过等待时间
      vi.advanceTimersByTime(150)

      debouncedFunc() // 立即调用 #2
      expect(func).toHaveBeenCalledTimes(2)
    })
  })

  describe('前后沿均触发 (leading: true, trailing: true)', () => {
    it('如果只调用一次，则只触发前沿', () => {
      const debouncedFunc = debounce(func, 100, {
        leading: true,
        trailing: true,
      })

      debouncedFunc()
      expect(func).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(100)
      expect(func).toHaveBeenCalledTimes(1)
    })

    it('如果在等待期内多次调用，则前后沿都应触发', () => {
      const debouncedFunc = debounce(func, 100, {
        leading: true,
        trailing: true,
      })

      debouncedFunc(1) // 前沿触发
      expect(func).toHaveBeenCalledWith(1)
      expect(func).toHaveBeenCalledTimes(1)

      debouncedFunc(2) // 在等待期内
      debouncedFunc(3) // 在等待期内

      // 快进时间
      vi.advanceTimersByTime(100)

      // 后沿触发，使用最后的参数
      expect(func).toHaveBeenCalledWith(3)
      expect(func).toHaveBeenCalledTimes(2)
    })
  })

  describe('`this` 上下文和参数', () => {
    it('应该在正确的 `this` 上下文中调用函数', () => {
      const myObject = {
        myMethod: func,
      }

      const debouncedMethod = debounce(myObject.myMethod, 100)
      debouncedMethod.call(myObject, 'test')

      vi.advanceTimersByTime(100)

      expect(func).toHaveBeenCalledTimes(1)
      expect(func).toHaveBeenCalledWith('test')
      expect(func.mock.instances[0]).toBe(myObject) // 验证 this 上下文
    })
  })
})
