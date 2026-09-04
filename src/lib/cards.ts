import { daysInMonth, monthKeyFor, shiftMonth } from '@/lib/format'

/**
 * El ciclo de facturación de una tarjeta de crédito (ADR 0004, D3): lo fija el
 * banco y no tiene por qué coincidir con el ciclo mensual del usuario.
 *
 * Parte el tiempo en dos: lo YA FACTURADO —que vence en una fecha y hay que
 * pagar— y lo que se está consumiendo ahora, que se factura al próximo cierre.
 */
export interface CardCycle {
  /** Primer día del período ya facturado. */
  closedFrom: string
  /** El cierre, inclusive: lo comprado ese día entra a esta facturación. */
  closedTo: string
  /** Cuándo vence el pago de ese período. */
  dueDate: string
  /** Primer día del período en curso. */
  openFrom: string
  /** El próximo cierre. */
  openTo: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * El día `day` dentro del mes `key` (YYYY-MM), recortado al último día que ese
 * mes tenga. Acá se paga la decisión de guardar 1–31 en vez de acotar a 28: una
 * tarjeta que cierra el 30 cierra el 28 de febrero, y el dato del banco se
 * guarda tal cual en vez de mutilarse (ADR 0004, D3).
 */
export function dayInMonth(key: string, day: number): string {
  const [y, m] = key.split('-').map(Number)
  return `${key}-${pad2(Math.min(Math.max(1, day), daysInMonth(y, m)))}`
}

/** El día siguiente, en ISO. A mano para no depender de la zona horaria. */
export function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (d < daysInMonth(y, m)) return `${iso.slice(0, 8)}${pad2(d + 1)}`
  return `${shiftMonth(`${y}-${pad2(m)}`, 1)}-01`
}

/**
 * En qué punto del ciclo está la tarjeta hoy.
 *
 * El cierre se cuenta INCLUSIVO y solo cuenta como cerrado cuando el día ya
 * pasó: el mismo día del cierre el período sigue abierto. Es la lectura
 * prudente — decir que algo ya está facturado antes de que el banco lo facture
 * es prometer un número que todavía puede cambiar.
 */
export function cardCycle(closingDay: number, dueDay: number, today: string): CardCycle {
  const mes = today.slice(0, 7)
  const cierreDeEsteMes = dayInMonth(mes, closingDay)
  const yaCerro = today > cierreDeEsteMes

  const closedTo = yaCerro ? cierreDeEsteMes : dayInMonth(shiftMonth(mes, -1), closingDay)
  const cierrePrevio = dayInMonth(shiftMonth(closedTo.slice(0, 7), -1), closingDay)
  const openTo = yaCerro ? dayInMonth(shiftMonth(mes, 1), closingDay) : cierreDeEsteMes

  /*
   * El vencimiento cae en el mismo mes que el cierre si el día de pago es
   * posterior (cierra el 5, paga el 22), y en el siguiente si no (cierra el 30,
   * paga el 18) — que es como funcionan las tarjetas en Perú.
   */
  const mesDelPago = dueDay > closingDay ? closedTo.slice(0, 7) : shiftMonth(closedTo.slice(0, 7), 1)

  return {
    closedFrom: nextDay(cierrePrevio),
    closedTo,
    dueDate: dayInMonth(mesDelPago, dueDay),
    openFrom: nextDay(closedTo),
    openTo,
  }
}

/** Días que faltan para `iso`. Negativo si ya pasó. */
export function daysUntil(iso: string, today: string): number {
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = iso.split('-').map(Number)
  const MS = 86_400_000
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS)
}

/** "vence hoy" · "vence mañana" · "vence en 18 días" · "venció hace 3 días" */
export function dueLabel(dueDate: string, today: string): string {
  const dias = daysUntil(dueDate, today)
  if (dias === 0) return 'vence hoy'
  if (dias === 1) return 'vence mañana'
  if (dias > 1) return `vence en ${dias} días`
  if (dias === -1) return 'venció ayer'
  return `venció hace ${-dias} días`
}

/** El ciclo del usuario al que pertenece una fecha; re-exportado por comodidad. */
export { monthKeyFor }

/* ---------- cuotas ---------- */

/**
 * El monto de la cuota `index` (0-based) de un total repartido en `count`.
 *
 * El resto de la división cae en la ÚLTIMA cuota: así las anteriores son el
 * número redondo que el usuario ve en su estado de cuenta mes a mes, y el
 * desajuste de céntimos se salda al final en vez de arrastrarse. La suma de
 * todas las cuotas es exactamente el total, siempre.
 */
export function installmentCents(totalCents: number, count: number, index: number): number {
  const base = Math.floor(totalCents / count)
  return index === count - 1 ? totalCents - base * (count - 1) : base
}

/* ---------- ocurrencias de recordatorios ---------- */

/**
 * La fecha en que un recordatorio mensual del día `day` cae dentro del ciclo
 * `[from, to]`. Con el ciclo del usuario arrancando a mitad de mes, el rango
 * cruza dos meses calendario y el día vive en uno de los dos.
 *
 * Devuelve `null` cuando el día no existe dentro del rango — puede pasar en
 * los bordes, y listarlo en una fecha que no le toca sería inventar un pago.
 */
export function monthlyOccurrence(day: number, from: string, to: string): string | null {
  for (const mes of [from.slice(0, 7), to.slice(0, 7)]) {
    const fecha = dayInMonth(mes, day)
    if (fecha >= from && fecha <= to) return fecha
  }
  return null
}
