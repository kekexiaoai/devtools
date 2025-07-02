import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path' // 需要安装: pnpm add -D path

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src') // 指向 ./frontend/src
    }
  }
})


