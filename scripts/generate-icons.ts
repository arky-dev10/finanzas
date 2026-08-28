/**
 * Genera todos los assets de la PWA a partir de la marca "S/" definida acá.
 * Fuente única: no hay SVGs sueltos que se puedan desincronizar del código.
 *
 *   node scripts/generate-icons.ts      (o `npm run icons`)
 *
 * La marca es monolínea: la S son dos arcos y la barra una recta, todo con
 * `stroke-linecap="round"`. No usa fuentes, así que el render es idéntico en
 * cualquier máquina.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { APPLE_SPLASH, splashName } from './apple-splash.ts'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BRAND = '#1e293b' // fondo de la marca (slate-800)
const ON_BRAND = '#ffffff'
const SPLASH_BG = '#f7f8fa' // igual que --page en index.css

/**
 * La marca dibujada en una caja de 512×512.
 * @param scale 1 = tamaño normal; <1 la encoge dejando aire (zona segura maskable).
 */
function mark(color: string, scale = 1) {
  const path = `
    <path d="M257 164 A56 56 0 1 0 214 256 A56 56 0 1 1 171 348"/>
    <path d="M316 356 L358 156"/>`
  const g = `<g fill="none" stroke="${color}" stroke-width="44" stroke-linecap="round">${path}</g>`
  if (scale === 1) return g
  const offset = (512 * (1 - scale)) / 2
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">${g}</g>`
}

interface Tile {
  bg?: string
  fg?: string
  /** Radio de las esquinas en unidades del viewBox de 512. */
  radius?: number
  scale?: number
}

/** Cuadrado (opcionalmente redondeado) con la marca centrada. */
function tile({ bg, fg = ON_BRAND, radius = 0, scale = 1 }: Tile) {
  const shape = bg
    ? `<rect width="512" height="512" rx="${radius}" fill="${bg}"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${shape}${mark(fg, scale)}</svg>`
}

const svg = (s: string) => Buffer.from(s)
const png = (source: string, w: number, h = w) =>
  sharp(svg(source)).resize(w, h).png({ compressionLevel: 9 }).toBuffer()

/**
 * Splash de iOS: fondo plano + la marca centrada, al 22% del lado corto.
 * iOS la muestra tal cual mientras arranca la app, así que debe verse igual
 * que el fondo real de la app o el salto se nota.
 */
async function splash(w: number, h: number) {
  const icon = Math.round(Math.min(w, h) * 0.22)
  const badge = await png(tile({ bg: BRAND, radius: 112 }), icon)
  return sharp({
    create: { width: w, height: h, channels: 4, background: SPLASH_BG },
  })
    .composite([{ input: badge, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  await mkdir(PUBLIC, { recursive: true })
  const out: string[] = []
  const write = async (name: string, buf: Buffer) => {
    await writeFile(join(PUBLIC, name), buf)
    out.push(`${name} · ${(buf.length / 1024).toFixed(1)} KB`)
  }

  // Ícono normal: esquinas redondeadas propias (Android "any", favicon).
  const rounded = tile({ bg: BRAND, radius: 112 })
  await write('favicon.svg', svg(rounded))
  for (const size of [64, 192, 512]) {
    await write(`pwa-${size}x${size}.png`, await png(rounded, size))
  }

  // Maskable: cuadrado a sangre y la marca al 62% para que ningún launcher
  // de Android le coma un pedazo al recortar en círculo.
  await write(
    'maskable-icon-512x512.png',
    await png(tile({ bg: BRAND, scale: 0.62 }), 512),
  )

  // iOS aplica su propia máscara: si le mandamos esquinas ya redondeadas
  // quedan dobles. Cuadrado a sangre, sin transparencia.
  await write(
    'apple-touch-icon-180x180.png',
    await png(tile({ bg: BRAND, scale: 0.86 }), 180),
  )

  // Atajos del manifest (long-press en el ícono de Android).
  await write('shortcut-add.png', await png(tile({ bg: BRAND, radius: 112 }), 96))

  for (const [w, h, dpr] of APPLE_SPLASH) {
    await write(splashName(w, h, dpr), await splash(w * dpr, h * dpr))
  }

  console.log(out.join('\n'))
  console.log(`\n${out.length} archivos en public/`)
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
