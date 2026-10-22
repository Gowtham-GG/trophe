import { defineConfig, type Plugin } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

/**
 * Runs the Vercel functions in api/ inside `npm run dev`, so local development needs no Vercel CLI.
 * Same code as production: each file's GET(request) is loaded through Vite and handed a real Request.
 */
function vercelApi(): Plugin {
  return {
    name: 'trophe-vercel-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/([a-z-]+)(\?.*)?$/)
        if (!m || req.method !== 'GET') return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.ts`) as { GET?: (r: Request) => Promise<Response> }
          if (!mod.GET) return next()
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const response = await mod.GET(new Request(`http://localhost${req.url}`, { headers }))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) { next(e) }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // functions read process.env (USDA_API_KEY, SUPABASE_URL…), like on Vercel: give them .env.local too
  for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), ''))) process.env[k] ??= v
  return {
  plugins: [
    vercelApi(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'theme-init.js'],
      manifest: {
        name: 'Trophe',
        short_name: 'Trophe',
        description: 'Eat well, see clearly. Your food, calories and body in one quiet place.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0b1916',
        theme_color: '#0b1916',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only. API traffic is never cached: the diary must always be fresh.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  }
})
