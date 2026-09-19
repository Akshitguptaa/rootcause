import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true
      },
      // Proxy chaos injection calls to individual services
      '/chaos/8080': { target: 'http://localhost:8080', changeOrigin: true, rewrite: (p) => p.replace('/chaos/8080', '/_chaos') },
      '/chaos/8081': { target: 'http://localhost:8081', changeOrigin: true, rewrite: (p) => p.replace('/chaos/8081', '/_chaos') },
      '/chaos/8082': { target: 'http://localhost:8082', changeOrigin: true, rewrite: (p) => p.replace('/chaos/8082', '/_chaos') },
      '/chaos/8083': { target: 'http://localhost:8083', changeOrigin: true, rewrite: (p) => p.replace('/chaos/8083', '/_chaos') },
      '/chaos/8084': { target: 'http://localhost:8084', changeOrigin: true, rewrite: (p) => p.replace('/chaos/8084', '/_chaos') },
    }
  }
})
