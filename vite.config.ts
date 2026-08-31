import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { APPLE_SPLASH, splashMedia, splashName } from './scripts/apple-splash.ts'

/**
 * iOS no lee el manifest: las pantallas de arranque se declaran con un <link>
 * por tamaño de pantalla. Se generan desde la misma lista que usan los PNG
 * (`scripts/apple-splash.ts`) para que agregar un modelo sea un solo cambio.
 */
function appleSplashLinks(): Plugin {
  return {
    name: 'finanzas:apple-splash-links',
    transformIndexHtml: () =>
      APPLE_SPLASH.map(([w, h, dpr]) => ({
        tag: 'link',
        injectTo: 'head' as const,
        attrs: {
          rel: 'apple-touch-startup-image',
          media: splashMedia(w, h, dpr),
          href: `/${splashName(w, h, dpr)}`,
        },
      })),
  }
}

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    appleSplashLinks(),
    VitePWA({
      // 'prompt' + registro manual desde <PwaUpdater/>: la app avisa que hay
      // versión nueva en vez de recargarse sola encima de un formulario.
      registerType: 'prompt',
      injectRegister: null,
      // Sin `includeAssets`: los globPatterns de abajo ya barren todo public/,
      // y declararlo dos veces duplica las entradas del precache.
      manifest: {
        // `id` fija la identidad de la app: sin esto, cambiar `start_url`
        // mañana crea una instalación nueva en vez de actualizar la existente.
        id: '/',
        name: 'Kumi',
        short_name: 'Kumi',
        description:
          'Kumi: control de gastos e ingresos por categoría, en soles y sin conexión.',
        lang: 'es-PE',
        dir: 'ltr',
        categories: ['finance', 'productivity'],
        theme_color: '#faf7f2',
        background_color: '#faf7f2',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        prefer_related_applications: false,
        // Si la app ya está abierta, el atajo va a esa ventana en vez de abrir otra.
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Long-press sobre el ícono en Android.
        shortcuts: [
          {
            name: 'Registrar movimiento',
            short_name: 'Registrar',
            description: 'Anotar un gasto o ingreso',
            url: '/registrar',
            icons: [{ src: 'shortcut-add.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Historial',
            short_name: 'Historial',
            description: 'Ver los movimientos por mes',
            url: '/historial',
            icons: [{ src: 'shortcut-add.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
        // Sin `screenshots` Chrome muestra el diálogo de instalación mínimo;
        // con ellas usa la ficha rica (título, descripción y capturas).
        screenshots: [
          {
            src: 'screenshots/resumen.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Resumen del mes con balance y presupuesto',
          },
          {
            src: 'screenshots/historial.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Historial por mes y gasto por categoría',
          },
          {
            src: 'screenshots/registrar.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Registrar un gasto en dos toques',
          },
          {
            src: 'screenshots/escritorio.png',
            sizes: '1280x800',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Kumi en el escritorio',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // La app es una SPA: cualquier ruta desconocida la resuelve el router.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
})
