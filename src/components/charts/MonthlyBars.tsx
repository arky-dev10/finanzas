import { DEVOLUCION } from '@/components/colors'
import { formatMoney, formatMoneyShort, monthShort } from '@/lib/format'

export interface MonthPoint {
  month: string
  income: number
  expense: number
}

/** Ingreso y gasto comparten escala (soles), así que van en un solo eje. */
const INCOME = '#008300'
const EXPENSE = '#e34948'
const H = 96

/**
 * Barras de los últimos meses. Tap en un mes cambia el mes de todo el resumen.
 * La posición (ingreso siempre a la izquierda) y la leyenda son la codificación
 * secundaria: verde/rojo solos no bastan con daltonismo.
 */
export function MonthlyBars({
  data,
  selected,
  onSelect,
}: {
  data: MonthPoint[]
  selected: string
  onSelect: (month: string) => void
}) {
  const max = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1)
  const point = data.find((d) => d.month === selected)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-1.5">
        {data.map((d) => {
          const isSel = d.month === selected
          return (
            <button
              key={d.month}
              onClick={() => onSelect(d.month)}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg px-0.5 pt-1 pb-1 transition ${
                isSel ? 'bg-muted' : 'active:bg-muted/50'
              }`}
              aria-label={`${monthShort(d.month)}: ingresos ${formatMoney(d.income)}, gastos ${formatMoney(d.expense)}`}
              aria-pressed={isSel}
            >
              <span className="flex h-24 w-full items-end justify-center gap-[3px]">
                <Bar value={d.income} max={max} color={INCOME} dim={!isSel} />
                <Bar value={d.expense} max={max} color={EXPENSE} dim={!isSel} />
              </span>
              <span
                className={`text-[10px] capitalize tabular-nums ${
                  isSel ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {monthShort(d.month)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <Key color={INCOME} label="Ingresos" value={point?.income} />
        <Key color={EXPENSE} label="Gastos" value={point?.expense} />
      </div>
    </div>
  )
}

function Bar({
  value,
  max,
  color,
  dim,
}: {
  value: number
  max: number
  color: string
  dim: boolean
}) {
  const h = value > 0 ? Math.max((value / max) * H, 3) : 0
  return (
    <span
      className="w-full max-w-[13px] rounded-t-[4px] transition-all"
      style={{ height: h, backgroundColor: color, opacity: dim ? 0.45 : 1 }}
    />
  )
}

/** Etiqueta directa solo del mes seleccionado — nunca un número sobre cada barra. */
function Key({ color, label, value }: { color: string; label: string; value?: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
      {value !== undefined && (
        <span className="font-semibold text-foreground tabular-nums">
          S/ {formatMoneyShort(value)}
        </span>
      )}
    </span>
  )
}

export interface CategoryMonthPoint {
  month: string
  total: number
}

/**
 * Variante de una sola serie de MonthlyBars, para la evolución de UNA
 * categoría (CategoryDetail): mismo lenguaje visual (tap cambia de mes,
 * barra redondeada, cifra directa solo del mes seleccionado) pero con el
 * color de la categoría en vez del par ingreso/gasto.
 *
 * Un mes con más devoluciones que gasto da neto NEGATIVO — pasa de verdad
 * (una devolución grande en una categoría de poco movimiento). Ese mes se
 * pinta de azul en vez del color de la categoría: si usáramos el mismo
 * `Bar` que ingreso/gasto (que solo dibuja alto para valores > 0) el mes
 * se vería como "sin datos", que es lo contrario de lo que pasó.
 */
export function CategoryMonthlyBars({
  data,
  selected,
  onSelect,
  color,
}: {
  data: CategoryMonthPoint[]
  selected: string
  onSelect: (month: string) => void
  color: string
}) {
  const max = Math.max(...data.map((d) => Math.abs(d.total)), 1)
  const point = data.find((d) => d.month === selected)
  const devolucion = point !== undefined && point.total < 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-1.5">
        {data.map((d) => {
          const isSel = d.month === selected
          const negativo = d.total < 0
          return (
            <button
              key={d.month}
              onClick={() => onSelect(d.month)}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-lg px-0.5 pt-1 pb-1 transition ${
                isSel ? 'bg-muted' : 'active:bg-muted/50'
              }`}
              aria-label={
                negativo
                  ? `${monthShort(d.month)}: te devolvieron ${formatMoney(-d.total)} más de lo que gastaste`
                  : `${monthShort(d.month)}: ${formatMoney(d.total)}`
              }
              aria-pressed={isSel}
            >
              <span className="flex h-24 w-full items-end justify-center">
                <Bar
                  value={Math.abs(d.total)}
                  max={max}
                  color={negativo ? DEVOLUCION : color}
                  dim={!isSel}
                />
              </span>
              <span
                className={`text-[10px] capitalize tabular-nums ${
                  isSel ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {monthShort(d.month)}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-center text-center text-[11px] text-muted-foreground">
        {point &&
          (devolucion ? (
            <span className="font-medium" style={{ color: DEVOLUCION }}>
              Te devolvieron{' '}
              <span className="font-semibold tabular-nums">{formatMoney(-point.total)}</span> más de
              lo que gastaste
            </span>
          ) : (
            <span className="font-semibold text-foreground tabular-nums">{formatMoney(point.total)}</span>
          ))}
      </div>
    </div>
  )
}
