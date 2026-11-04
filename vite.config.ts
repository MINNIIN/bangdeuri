/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 턴테이블 노래 검색 (배포에서는 functions/api/music.ts가 같은 일을 한다)
      '/api/music': {
        target: 'https://itunes.apple.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/music\?/, '/search?') + '&country=US&entity=song&media=music&limit=20',
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
