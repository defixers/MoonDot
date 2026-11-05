import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer') } },
    plugins: [vue()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  },
})
