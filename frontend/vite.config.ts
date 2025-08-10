/// <reference types="vitest" />
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@wailsjs': path.resolve(__dirname, './wailsjs'), // 新增 wailsjs 别名
    },
  },
  test: {
    globals: true,
    // Use happy-dom to simulate a DOM environment for testing
    environment: 'happy-dom',
  },
})
