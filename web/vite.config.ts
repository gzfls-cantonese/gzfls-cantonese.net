import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

// Serves the generated dataset assets (../dist-assets) at /data during dev so
// the app can fetch real manifest/episode/audio without CORS or copying 2.5GB.
function serveDistAssets(): Plugin {
  const root = resolve(here, '../dist-assets')
  const types: Record<string, string> = {
    '.json': 'application/json; charset=utf-8',
    '.opus': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }
  return {
    name: 'serve-dist-assets',
    configureServer(server) {
      server.middlewares.use('/data', async (req, res, next) => {
        try {
          const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
          const filePath = join(root, normalize(urlPath).replace(/^(\.\.[/\\])+/, ''))
          if (!filePath.startsWith(root)) return next()
          const s = await stat(filePath)
          if (s.isDirectory()) {
            res.statusCode = 404
            return res.end('Not Found')
          }
          res.setHeader('Content-Type', types[extname(filePath)] || 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Accept-Ranges', 'bytes')
          const buf = await readFile(filePath)
          res.statusCode = 200
          res.end(buf)
        } catch {
          // Missing asset under /data must 404 (like OSS would), not fall
          // through to the SPA index.html which would mask it as a 200.
          res.statusCode = 404
          res.end('Not Found')
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveDistAssets()],
  server: { port: 5173, host: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
