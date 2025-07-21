import { useEffect, useState } from 'react'

export function useThemeDetector() {
  // 获取一个 MediaQueryList 对象，它能告诉我们当前的系统主题
  const getCurrentTheme = () =>
    window.matchMedia('(prefers-color-scheme: dark)').matches

  // 创建一个 state 来存储当前是否为暗黑模式
  const [isDarkTheme, setIsDarkTheme] = useState(getCurrentTheme())

  // 在 useEffect 中设置事件监听
  useEffect(() => {
    const mqListener = (e: MediaQueryListEvent) => {
      setIsDarkTheme(e.matches)
    }

    const darkThemeMq = window.matchMedia('(prefers-color-scheme: dark)')

    // 为主题变化添加监听器
    // 使用 .addEventListener 是更现代的写法
    darkThemeMq.addEventListener('change', mqListener)

    // 返回一个清理函数，在组件卸载时移除监听
    return () => {
      darkThemeMq.removeEventListener('change', mqListener)
    }
  }, []) // 空依赖数组，确保只在挂载时运行一次

  return isDarkTheme
}
