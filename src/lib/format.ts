const pen = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
})

export function formatMoney(n: number): string {
  return pen.format(n)
}

/** Monto compacto para ejes de gráficos: 1.2k, 850 */
export function formatMoneyShort(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return String(Math.round(n))
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
