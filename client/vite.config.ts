import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Sichtbare Build-Kennung (UTC), z. B. "21.07 14:32"
    __BUILD_ID__: JSON.stringify(
      new Date().toISOString().slice(5, 16).replace('-', '.').replace('T', ' '),
    ),
  },
  plugins: [
    react(),
    // Macht die App installierbar (App-Icon auf Handy/Desktop, Standalone-Fenster)
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Language Teacher · Učitelj jezika',
        short_name: 'Language Teacher',
        description: 'KI-Sprachlehrer für Deutsch, Englisch und Serbisch',
        lang: 'de',
        display: 'standalone',
        theme_color: '#FBF5F4',
        background_color: '#FBF5F4',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // API-Aufrufe (inkl. SSE-Streaming) nie vom Service Worker abfangen
        navigateFallbackDenylist: [/^\/api/],
        // Neue Version soll ohne doppeltes Neuöffnen aktiv werden (iOS-PWA
        // hängt sonst gern auf altem Stand — Nutzer sah tagelang alte Builds)
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  server: {
    proxy: {
      // Alle /api-Aufrufe gehen an den Express-Server (SSE-kompatibel).
      // SERVER_PORT erlaubt eine zweite Dev-Instanz (z. B. Worktree) ohne Kollision.
      '/api': `http://localhost:${process.env.SERVER_PORT ?? '3001'}`,
    },
  },
})
