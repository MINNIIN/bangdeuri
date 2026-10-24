/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 5173·5174는 다른 프로젝트(mucha 등)가 쓰고 있어서 고정 포트로 띄운다
  server: {
    port: 5175,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
  },
})
