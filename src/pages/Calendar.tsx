import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, CircleAlert, CreditCard, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { MonthNav } from '@/components/MonthNav'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/CategoryIcon'
import { nextDay } from '@/lib/cards'
import { cycleRange, formatDate, formatMoney } from '@/lib/format'
import {
  available,
  currentMonthKey,
  getCategory,
  markOccurrencePaid,
  monthEntries,
  occurrencesIn,
  overdueOccurrences,
  unmarkOccurrencePaid,
  useData,
  type Occurrence,
} from '@/lib/store'
import { todayISO } from '@/lib/format'

const LINK = '#2a78d6'
const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Lunes = 0. `getDay()` cuenta desde el domingo y acá la semana arranca el lunes. */
function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

interface Day {
  date: string
  spentCents: number
  /** Color de la categoría de mayor gasto del día, para el punto. */
  color?: string
  occurrences: Occurrence[]
}

/**
 * El Calendario: la forma del ciclo, con sus dos mitades (enmienda del ADR
 * 0003). Los días que pasaron muestran cuánto se fue; los que vienen, lo que
 * se debe.
 *
 * Comida y pasajes aparecen acá como RASTRO de lo gastado, no como
 * recordatorios: no tienen fecha, tienen ritmo y tope, y eso vive en el
 * presupuesto de su categoría.
 */
export function Calendar() {
  const navigate = useNavigate()
  const { monthStartDay, reminders } = useData()
  const [month, setMonth] = useState(currentMonthKey())
  const hoy = todayISO()

  const { from, to } = cycleRange(month, monthStartDay)
  const ocurrencias = occurrencesIn(month, hoy)
  const vencidas = month === currentMonthKey() ? overdueOccurrences(hoy) : []

  // Gasto por día del ciclo. Las cuotas cuentan acá con su peso del mes: es el
  // mismo número que suma el total, así que la grilla y el total no se pelean.
  const gasto = new Map<string, { cents: number; color?: string; mayor: number }>()
  for (const { tx, centsInMonth } of monthEntries(month)) {
    if (tx.nature !== 'expense') continue
    const previo = gasto.get(tx.date) ?? { cents: 0, mayor: 0 }
    const color = getCategory(tx.categoryId ?? '')?.color
    gasto.set(tx.date, {
      cents: previo.cents + centsInMonth,
      color: centsInMonth > previo.mayor ? color : previo.color,
      mayor: Math.max(previo.mayor, centsInMonth),
    })
  }

  const dias: Day[] = []
  for (let d = from; d <= to; d = nextDay(d)) {
    const g = gasto.get(d)
    dias.push({
      date: d,
      spentCents: g?.cents ?? 0,
      color: g?.color,
      occurrences: ocurrencias.filter((o) => o.date === d),
    })
  }
  const relleno = weekdayIndex(from)
  const maximo = Math.max(...dias.map((d) => d.spentCents), 1)

  const pendientes = ocurrencias.filter((o) => !o.paid)

  /*
   * El Disponible vive acá además del Resumen (ADR 0003, D3): el Resumen da el
   * número y el Calendario, que es donde están los compromisos uno por uno,
   * muestra de dónde sale. Solo en el ciclo actual — en otro sería un número
   * de un momento que no es este.
   */
  const disponible = month === currentMonthKey() ? available(month, hoy) : null

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-nav">
      <MonthNav month={month} onChange={setMonth} />

      {disponible !== null && (
        <section className="surface flex items-baseline justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm text-muted-foreground">Disponible</span>
            <span className="text-[11px] text-muted-foreground">
              {disponible.committedCents > 0
                ? `Ya descontados ${formatMoney(disponible.committedCents)} de compromisos`
                : 'Sin compromisos pendientes en el ciclo'}
            </span>
          </div>
          <span className="shrink-0 text-xl font-bold tabular-nums">
            {disponible.reliable ? formatMoney(disponible.cents) : '—'}
          </span>
        </section>
      )}

      <section className="surface p-4">
        <div className="mb-2 grid grid-cols-7 gap-1">
          {DIAS.map((d, i) => (
            <span key={i} className="text-center text-[10px] font-medium text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: relleno }, (_, i) => (
            <span key={`p${i}`} />
          ))}
          {dias.map((d) => (
            <DayCell key={d.date} day={d} today={hoy} max={maximo} />
          ))}
        </div>
        <p className="mt-3 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" /> gastaste
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full border border-current" /> toca pagar
          </span>
        </p>
      </section>

      {vencidas.length > 0 && (
        <Group title="Vencido" tone="text-rose-600">
          {vencidas.map((o) => (
            <OccurrenceRow key={`${o.id}-${o.date}`} o={o} />
          ))}
        </Group>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Este ciclo
          </h2>
          <button
            onClick={() => navigate('/recordatorios/nuevo')}
            className="flex items-center gap-1 text-sm font-medium"
            style={{ color: LINK }}
          >
            <Plus size={15} />
            Agregar
          </button>
        </div>
        <div className="surface flex flex-col divide-y divide-border p-1">
          {ocurrencias.length === 0 ? (
            <p className="p-4 text-xs leading-relaxed text-muted-foreground">
              {reminders.length === 0
                ? 'Anota lo que se repite todos los meses —luz, internet, alquiler, el sueldo— y el calendario te dice qué viene. Comida y pasajes no van acá: esos tienen tope, no fecha.'
                : 'Nada que pagar ni cobrar en este ciclo.'}
            </p>
          ) : (
            ocurrencias.map((o) => <OccurrenceRow key={`${o.id}-${o.date}`} o={o} />)
          )}
        </div>
        {pendientes.length > 0 && (
          <p className="px-1 text-[11px] text-muted-foreground">
            {pendientes.length === 1 ? 'Queda 1 pendiente' : `Quedan ${pendientes.length} pendientes`}
            {' en este ciclo.'}
          </p>
        )}
      </section>
    </div>
  )
}

function Group({
  title,
  tone,
  children,
}: {
  title: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className={`px-1 text-xs font-semibold tracking-wide uppercase ${tone}`}>{title}</h2>
      <div className="surface flex flex-col divide-y divide-border p-1">{children}</div>
    </section>
  )
}

/**
 * Un día del ciclo. El pasado se lee por la barra de gasto; el futuro, por el
 * anillo del compromiso. Distinguirlos importa: si se vieran iguales, el rastro
 * de lo que ya gastaste pasaría por una cuenta pendiente.
 */
function DayCell({ day, today, max }: { day: Day; today: string; max: number }) {
  const esHoy = day.date === today
  const futuro = day.date > today
  const pendiente = day.occurrences.some((o) => !o.paid)
  const alto = Math.round((day.spentCents / max) * 14)

  return (
    <div
      className={`flex h-12 flex-col items-center justify-start rounded-lg pt-1 ${
        esHoy ? 'bg-accent/20 ring-1 ring-accent' : futuro ? 'bg-muted/30' : ''
      }`}
    >
      <span
        className={`text-[10px] tabular-nums ${esHoy ? 'font-bold' : 'text-muted-foreground'}`}
      >
        {Number(day.date.slice(8, 10))}
      </span>
      {pendiente ? (
        <span
          className="mt-1 h-2.5 w-2.5 rounded-full border-[1.5px]"
          style={{ borderColor: futuro ? LINK : '#e11d48' }}
          aria-label="toca pagar"
        />
      ) : day.spentCents > 0 ? (
        <span
          className="mt-auto mb-1 w-2 rounded-full"
          style={{ height: Math.max(3, alto), backgroundColor: day.color ?? '#6b7280' }}
          aria-label={`gastaste ${formatMoney(day.spentCents)}`}
        />
      ) : null}
    </div>
  )
}

/** Una fila del listado: qué toca, cuándo, y el único botón que mueve plata. */
function OccurrenceRow({ o }: { o: Occurrence }) {
  const navigate = useNavigate()
  const cat = o.categoryId ? getCategory(o.categoryId) : undefined
  const esIngreso = o.kind === 'income'
  // El pago de una tarjeta no se marca a mano: está saldado cuando no queda
  // nada facturado, y eso ya lo dicen los movimientos.
  const esTarjeta = o.cardAccountId !== undefined

  return (
    <div className="flex items-center gap-3 p-3">
      {cat ? (
        <CategoryIcon category={cat} size="sm" />
      ) : (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            esTarjeta ? 'bg-rose-50 text-rose-500' : 'bg-muted text-muted-foreground'
          }`}
        >
          {esTarjeta ? <CreditCard size={16} /> : o.overdue ? <CircleAlert size={16} /> : <Check size={16} />}
        </span>
      )}
      <button
        onClick={() =>
          navigate(esTarjeta ? '/cuentas' : `/recordatorios/${o.id}`)
        }
        className="min-w-0 flex-1 text-left"
      >
        <span className={`block truncate text-sm font-medium ${o.paid ? 'line-through opacity-60' : ''}`}>
          {o.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {formatDate(o.date)}
          {esTarjeta ? ' · tarjeta' : ''}
          {o.overdue && !o.paid ? ' · vencido' : ''}
          {o.paid ? ' · pagado' : ''}
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`text-sm font-semibold tabular-nums ${
            esIngreso ? 'text-emerald-600' : o.overdue && !o.paid ? 'text-rose-600' : ''
          }`}
        >
          {/* Sin monto se lista igual: no le inventamos uno (ADR 0003, D3). */}
          {o.amountCents === undefined
            ? '—'
            : `${esIngreso ? '+' : ''}${formatMoney(o.amountCents)}`}
        </span>
        {o.paid ? (
          esTarjeta ? null : (
            <button
              onClick={() => {
                unmarkOccurrencePaid(o.id, o.date)
                toast('Marcado como pendiente de nuevo')
              }}
              className="text-[11px] text-muted-foreground"
            >
              Deshacer
            </button>
          )
        ) : (
          <div className="flex items-center gap-2">
            {!esTarjeta && (
              <button
                onClick={() => {
                  markOccurrencePaid(o.id, o.date)
                  toast(`${o.name} marcado`, {
                    description: 'No se registró ningún movimiento: solo el real mueve la plata.',
                    action: {
                      label: 'Deshacer',
                      onClick: () => unmarkOccurrencePaid(o.id, o.date),
                    },
                  })
                }}
                className="text-[11px] text-muted-foreground"
              >
                Marcar
              </button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                navigate(
                  esTarjeta
                    ? `/registrar?pagar=${o.cardAccountId}&monto=${o.amountCents ?? 0}`
                    : `/registrar?recordatorio=${o.id}&fecha=${o.date}`,
                )
              }
              className="h-7 px-2 text-xs"
              style={{ color: LINK }}
            >
              {esIngreso ? 'Cobrar' : 'Pagar'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
