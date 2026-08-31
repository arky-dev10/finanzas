/**
 * Genera todos los assets de la PWA a partir del logo de Kumi
 * (`assets/brand/kumi-logo.png`, el perrito dormido abrazando el gráfico).
 * Fuente única: no hay SVGs sueltos ni marca dibujada en código que se
 * puedan desincronizar del logo real.
 *
 *   node scripts/generate-icons.ts      (o `npm run icons`)
 *
 * El PNG fuente ya trae sus propias esquinas redondeadas y el fondo crema
 * horneados (exportado como un ícono de app clásico, con margen transparente
 * alrededor). `loadMark()` recorta ese margen una sola vez y de ahí salen
 * todos los tamaños.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { APPLE_SPLASH, splashName } from './apple-splash.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')
const LOGO = join(ROOT, 'assets', 'brand', 'kumi-logo.png')

// Crema real del PNG fuente (muestreado del fondo del logo), igual a --page
// en index.css: así cualquier "a sangre" se funde con el resto de la app.
const CREMA = '#faf7f2'

/**
 * Recorta el margen transparente del logo fuente y lo deja cuadrado
 * (relleno transparente si el recorte no dio un cuadrado exacto), listo
 * para reescalar sin deformarlo.
 */
async function loadMark(): Promise<Buffer> {
  const { data, info } = await sharp(LOGO).trim().png().toBuffer({ resolveWithObject: true })
  const side = Math.max(info.width, info.height)
  const top = Math.floor((side - info.height) / 2)
  const left = Math.floor((side - info.width) / 2)
  return sharp(data)
    .extend({
      top,
      bottom: side - info.height - top,
      left,
      right: side - info.width - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
}

/** Ícono con las esquinas redondeadas propias que ya trae el PNG fuente. */
function iconWithOwnCorners(mark: Buffer, size: number) {
  return sharp(mark).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
}

/**
 * Cuadrado a sangre: el logo achicado y centrado sobre el mismo crema
 * exacto del PNG fuente, así el margen y las esquinas redondeadas del
 * recorte se funden con el fondo y no se notan.
 */
async function iconOnCremaBleed(mark: Buffer, size: number, scale: number) {
  const inner = Math.round(size * scale)
  const resized = await sharp(mark).resize(inner, inner).toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: CREMA } })
    .composite([{ input: resized, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/**
 * Splash de iOS: fondo crema plano + el logo centrado. Como el crema es el
 * mismo del fondo real de la app, no hace falta simular una tarjeta: el
 * salto entre el splash y la app cargada es invisible.
 */
async function splash(mark: Buffer, w: number, h: number) {
  const icon = Math.round(Math.min(w, h) * 0.32)
  const badge = await sharp(mark).resize(icon, icon).toBuffer()
  return sharp({ create: { width: w, height: h, channels: 4, background: CREMA } })
    .composite([{ input: badge, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  await mkdir(PUBLIC, { recursive: true })
  const mark = await loadMark()
  const out: string[] = []
  const write = async (name: string, buf: Buffer) => {
    await writeFile(join(PUBLIC, name), buf)
    out.push(`${name} · ${(buf.length / 1024).toFixed(1)} KB`)
  }

  // Ícono normal: esquinas redondeadas propias (Android "any", favicon).
  for (const size of [64, 192, 512]) {
    await write(`pwa-${size}x${size}.png`, await iconWithOwnCorners(mark, size))
  }

  // Maskable: cuadrado a sangre, logo al 62% para que Android no le coma un
  // pedazo al perrito al recortar en círculo.
  await write('maskable-icon-512x512.png', await iconOnCremaBleed(mark, 512, 0.62))

  // iOS aplica su propia máscara: si le mandamos esquinas ya redondeadas
  // quedan dobles. Cuadrado a sangre, sin transparencia.
  await write('apple-touch-icon-180x180.png', await iconOnCremaBleed(mark, 180, 0.84))

  // Atajos del manifest (long-press en el ícono de Android).
  await write('shortcut-add.png', await iconWithOwnCorners(mark, 96))

  for (const [w, h, dpr] of APPLE_SPLASH) {
    await write(splashName(w, h, dpr), await splash(mark, w * dpr, h * dpr))
  }

  console.log(out.join('\n'))
  console.log(`\n${out.length} archivos en public/`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
