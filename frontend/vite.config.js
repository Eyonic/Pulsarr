import fs from 'fs'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDocker = fs.existsSync('/.dockerenv')
  let backendTarget = env.VITE_BACKEND_URL || 'http://backend:8000'

  // Prevent localhost from breaking inside the frontend container; use compose service name instead.
  if (isDocker) {
    const lower = backendTarget.toLowerCase()
    if (lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('::1')) {
      backendTarget = 'http://backend:8000'
    }
  }

  return defineConfig({
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: ['up.mythx.nl'], // 👈 ADD THIS
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  })
}
