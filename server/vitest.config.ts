import { defineConfig } from 'vitest/config'

/**
 * Propia y no la del cliente: sin este archivo vitest sube al repo raíz, toma
 * la config de la PWA y no encuentra sus dependencias.
 */
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
