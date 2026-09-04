/*
 * Toda la plata de la app son céntimos enteros (S/ 12.50 = 1250). Los soles
 * existen solo como el string que el usuario tipea: entran con
 * `parseAmountToCents` y salen con `formatMoney`. En el medio nunca hay
 * decimales, así las comparaciones de presupuesto son exactas.
 */

const pen = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
})

/** Recibe CÉNTIMOS. `formatMoney(1250)` → "S/ 12.50". */
export function formatMoney(cents: number): string {
  return pen.format(cents / 100)
}

/** Monto compacto para ejes de gráficos, en céntimos: 350000 → "3.5k", 85000 → "850" */
export function formatMoneyShort(cents: number): string {
  const soles = cents / 100
  if (Math.abs(soles) >= 1000) {
    const k = soles / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return String(Math.round(soles))
}

/**
 * Lo que tipeó el usuario ("12.5") a céntimos (1250), o null si no es un monto.
 * Parseo por string y no `Math.round(Number(s) * 100)`: en coma flotante
 * `8.165 * 100` es 816.4999…, que redondea a 816 y pierde un céntimo.
 */
export function parseAmountToCents(raw: string): number | null {
  const s = raw.trim()
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(s)) return null
  const [int = '', dec = ''] = s.split('.')
  return Number(int || '0') * 100 + Number(dec.padEnd(2, '0') || '0')
}

/** Céntimos al string que va dentro del input al editar: 1250 → "12.50" */
export function centsToInput(cents: number): string {
  const abs = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MONTHS[Number(m) - 1]} ${y}`
}

/** "agosto 2026" -> "Agosto 2026". Para meses embebidos en una frase,
 *  donde `capitalize` de CSS capitalizaría también las otras palabras. */
export function monthLabelCap(key: string): string {
  const l = monthLabel(key)
  return l.charAt(0).toUpperCase() + l.slice(1)
}

/** Etiqueta corta para el eje del gráfico mensual: "ago" */
export function monthShort(key: string): string {
  const [, m] = key.split('-')
  return MONTHS[Number(m) - 1].slice(0, 3)
}

/** Devuelve la clave de mes desplazada `delta` meses. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

/* ---------- ciclo mensual configurable ---------- */

/**
 * Ciclo al que pertenece una fecha. El ciclo "M" va del `startDay` del mes
 * M−1 al día `startDay − 1` del mes M, y se etiqueta por el mes en que
 * TERMINA: es el mes cuyo sueldo se está gastando (quien cobra el 28 de
 * agosto gasta desde ese día la plata de septiembre). Con `startDay` 1 el
 * ciclo ES el mes calendario, idéntico al comportamiento de siempre.
 */
export function monthKeyFor(dateISO: string, startDay: number): string {
  const month = dateISO.slice(0, 7)
  if (startDay <= 1) return month
  return Number(dateISO.slice(8, 10)) >= startDay ? shiftMonth(month, 1) : month
}

/** Días del mes calendario (`m` 1–12). A mano para no pasar por Date. */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Primer y último día (ISO, inclusive) del ciclo etiquetado `key`. */
export function cycleRange(key: string, startDay: number): { from: string; to: string } {
  if (startDay <= 1) {
    const [y, m] = key.split('-').map(Number)
    return { from: `${key}-01`, to: `${key}-${pad2(daysInMonth(y, m))}` }
  }
  return {
    from: `${shiftMonth(key, -1)}-${pad2(startDay)}`,
    to: `${key}-${pad2(startDay - 1)}`,
  }
}

/**
 * Rango del ciclo para mostrar bajo el nombre del mes: "28 ago – 27 sep".
 * Devuelve null con `startDay` 1: ahí el nombre del mes ya lo dice todo.
 */
export function cycleSublabel(key: string, startDay: number): string | null {
  if (startDay <= 1) return null
  const { from, to } = cycleRange(key, startDay)
  return `${formatDate(from)} – ${formatDate(to)}`
}

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1].slice(0, 3)}`
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** Deja solo dígitos, un punto decimal y máximo 2 decimales. */
export function sanitizeAmount(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '')
  const dot = s.indexOf('.')
  if (dot !== -1) {
    const int = s.slice(0, dot)
    const dec = s.slice(dot + 1).replace(/\./g, '').slice(0, 2)
    s = `${int}.${dec}`
  }
  return s
}
