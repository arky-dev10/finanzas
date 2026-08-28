/**
 * Pantallas de arranque de iOS. Sin esto, abrir la app desde la pantalla de
 * inicio muestra un rectángulo blanco vacío hasta que carga: es la diferencia
 * más visible entre "acceso directo a una web" y "app instalada".
 *
 * Lo consume `scripts/generate-icons.mjs` (genera los PNG) y `vite.config.ts`
 * (inyecta los <link> en el HTML). Una sola lista para que no se desincronicen.
 *
 * Solo portrait: el manifest fija `orientation: 'portrait'`.
 */

/** [ancho en pt, alto en pt, densidad] de los iPhone/iPad vigentes. */
export const APPLE_SPLASH: ReadonlyArray<readonly [number, number, number]> = [
  [440, 956, 3], // iPhone 16 Pro Max / 15 Pro Max
  [430, 932, 3], // iPhone 15 Plus / 14 Pro Max
  [402, 874, 3], // iPhone 16 Pro
  [393, 852, 3], // iPhone 16 / 15 / 14 Pro
  [390, 844, 3], // iPhone 14 / 13 / 12
  [375, 812, 3], // iPhone 13 mini / X / XS / 11 Pro
  [360, 780, 3], // iPhone 12 mini
  [414, 896, 3], // iPhone 11 Pro Max / XS Max
  [414, 896, 2], // iPhone 11 / XR
  [414, 736, 3], // iPhone 8 Plus
  [375, 667, 2], // iPhone SE / 8 / 7
  [1024, 1366, 2], // iPad Pro 12.9"
  [834, 1194, 2], // iPad Pro 11"
  [810, 1080, 2], // iPad 10.2"
]

export const splashName = (w: number, h: number, dpr: number) => `apple-splash-${w}-${h}-${dpr}x.png`

export const splashMedia = (w: number, h: number, dpr: number) =>
  `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`
