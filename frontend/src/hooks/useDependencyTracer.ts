import { useEffect, useRef } from 'react'
import type { AdvancedLogger } from '@/utils/logger'

// 仅保留核心依赖追踪功能
export function useDependencyTracer(
  dependencies: Record<string, unknown>, // 改为对象类型
  logger: AdvancedLogger = console as unknown as AdvancedLogger,
  label = 'Dependencies'
) {
  const prevDepsRef = useRef<Record<string, unknown> | null>(null) // 改为对象存储
  const isDev = process.env.NODE_ENV === 'development'
  const isFirstRender = useRef(true)

  useEffect(() => {
    // 只在开发环境执行
    if (!isDev) return
    // 首次渲染不记录变化
    if (isFirstRender.current) {
      isFirstRender.current = false
      // 初始化存储对象副本
      prevDepsRef.current = { ...dependencies }
      return
    }
    const prevDeps = prevDepsRef.current
    if (prevDeps !== null) {
      // 获取所有依赖项键名并找出变化
      const allKeys = new Set([
        ...Object.keys(prevDeps),
        ...Object.keys(dependencies),
      ])
      const changes = Array.from(allKeys)
        .map((key) => ({
          key,
          previous: prevDeps[key],
          current: dependencies[key],
          changed: !Object.is(prevDeps[key], dependencies[key]),
        }))
        .filter((item) => item.changed)

      if (changes.length > 0) {
        changes.forEach(({ key, previous, current }) => {
          logger.debug(
            label,
            `Key: ${key}`,
            'Previous:',
            previous,
            'Current:',
            current
          )
        })
      }
    }
    // 更新存储的依赖项副本
    prevDepsRef.current = { ...dependencies }
  }, [dependencies, label, isDev, logger])
}

/**
 * A custom hook for development to trace and log component dependency changes.
 * This hook will not run in production builds.
 * @param props An object whose properties are the dependencies to track.
 * @param logger An AdvancedLogger instance to use for logging.
 */
export function useDependencyTracerAdvanced(
  props: Record<string, unknown>,
  logger: AdvancedLogger
): void {
  const prevPropsRef = useRef<Record<string, unknown>>({})
  const isFirstRender = useRef(true)

  // 使用浅比较快速检测是否需要深入处理
  const hasShallowChanges = Object.keys({
    ...prevPropsRef.current,
    ...props,
  }).some((key) => {
    const prevValue = prevPropsRef.current[key]
    const currentValue = props[key]
    logger.debug(`[useDependencyTracer] key: ${key}`, prevValue, currentValue)
    // 专门处理React ref对象的比较
    const isPrevRef =
      prevValue && typeof prevValue === 'object' && 'current' in prevValue
    const isCurrentRef =
      currentValue &&
      typeof currentValue === 'object' &&
      'current' in currentValue

    if (isPrevRef && isCurrentRef) {
      // 比较ref的current属性
      return prevValue.current !== currentValue.current
    } else if (isPrevRef || isCurrentRef) {
      // 一个是ref另一个不是，肯定变化了
      return true
    } else {
      // 普通浅比较
      return prevValue !== currentValue
    }
  })

  useEffect(() => {
    // 生产环境直接退出
    if (process.env.NODE_ENV !== 'development') return

    // 首次渲染不记录变化
    if (isFirstRender.current) {
      isFirstRender.current = false
      // 只在首次渲染时初始化，避免重复序列化
      prevPropsRef.current = { ...props }
      return
    }

    // 无浅变化时直接返回
    if (!hasShallowChanges) {
      return
    }

    // 创建共享的循环引用处理函数生成器
    const createCircularReplacer = () => {
      const seen = new WeakSet()
      return (key: string, value: unknown) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) return '[Circular]'
          seen.add(value)
        }
        if (typeof value === 'bigint') return `${value}n`
        return value
      }
    }

    const format = (v: unknown): string => {
      if (v === null) return 'null'
      if (v === undefined) return 'undefined'
      if (typeof v === 'function') return '[Function]'
      if (typeof v === 'object') {
        try {
          return JSON.stringify(v, createCircularReplacer())
        } catch (error) {
          logger.error('Error serializing object', error)
          return '[Unserializable Object]'
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      return v.toString()
    }

    const changedProps: Record<string, { from: string; to: string }> = {}
    Object.keys({ ...prevPropsRef.current, ...props }).forEach((key) => {
      if (prevPropsRef.current[key] !== props[key]) {
        changedProps[key] = {
          from: format(prevPropsRef.current[key]),
          to: format(props[key]),
        }
      }
    })

    if (Object.keys(changedProps).length > 0) {
      logger.debug('Dependencies changed', changedProps)
    }

    try {
      // 只在有变化时才更新缓存
      prevPropsRef.current = JSON.parse(
        JSON.stringify(props, createCircularReplacer())
      ) as Record<string, unknown>
    } catch (error) {
      prevPropsRef.current = { ...props }
      logger.error('Error serializing props', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShallowChanges])
}
