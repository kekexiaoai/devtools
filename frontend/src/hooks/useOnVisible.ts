import { useEffect, useRef } from 'react'

/**
 * 一个自定义 Hook，当组件从“不可见”变为“可见”时，会执行一次回调函数。
 * @param callback 当组件变为可见时要执行的函数。
 * @param isVisible 组件当前是否可见。
 */
export function useOnVisible(callback: () => void, isVisible: boolean) {
  // useRef 用于在多次渲染之间，持久化地存储一个值，且改变它不会触发重渲染。
  // 我们用它来记录上一次渲染时，组件是否可见。
  const wasVisibleRef = useRef(false)

  useEffect(() => {
    if (isVisible && !wasVisibleRef.current) {
      console.log(`useOnVisible: ${isVisible}, exec`, callback)
      callback()
    }

    // 在 effect 的最后，将当前可见性状态同步到 ref 中，供下一次渲染使用。
    wasVisibleRef.current = isVisible
  }, [isVisible, callback])
}
