import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Plugin to handle PDF.js worker file requests with ?import query
const pdfWorkerPlugin = () => {
  return {
    name: 'pdf-worker-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Handle PDF.js worker requests that include ?import
        if (req.url?.startsWith('/pdf.worker.min.mjs')) {
          const workerPath = path.resolve(__dirname, 'public', 'pdf.worker.min.mjs')
          if (fs.existsSync(workerPath)) {
            // Set correct Content-Type for ES module worker
            // Use 'text/javascript' for better browser compatibility
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
            // Set status code explicitly
            res.statusCode = 200
            // Set CORS headers if needed (for cross-origin requests)
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Access-Control-Allow-Methods', 'GET')
            // Read and send file content
            const fileContent = fs.readFileSync(workerPath)
            res.end(fileContent)
            return
          }
        }
        next()
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // Use relative paths for Electron file:// protocol compatibility
  plugins: [react(), pdfWorkerPlugin()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    // Web API proxy - DISABLED for Desktop mode
    // proxy: {
    //   '/api': {
    //     target: 'http://localhost:3000',
    //     changeOrigin: true,
    //   },
    // },
  },
})

