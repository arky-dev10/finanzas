import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { MonthNav } from '@/components/MonthNav'
import { CategoryIcon } from '@/components/CategoryIcon'
import { TransactionItem } from '@/components/TransactionItem'
import { budgetState } from '@/lib/budget'
import { formatMoney, monthKey, monthLabelCap } from '@/lib/format'
import {
  balanceTrend,
  budgetStatus,
  expenseByCategory,
  getCategory,
  monthlyBudgetStatus,
  monthTotals,
  type MonthlyBudgetStatus,
  transactionsByMonth,
  useData,
} from '@/lib/store'
import type { Category } from '@/types'

const TOP = 3
const RECENT = 5
/** Un presupuesto solo aparece si ya te pasaste o estás por pasarte. */
const ATENCION = 0.9
const LINK = '#2a78d6'

interface Row {
  category: Category
  total: number
  pct: number
  width: number
}

/**
 * Cuatro niveles, en este orden:
 *  1. ¿Cuánto dinero tengo?          — balance, ingresos/gastos y avance del tope
 *                                      del mes, todo en la misma tarjeta
 *  2. ¿En qué se me está yendo?      — inmediatamente debajo
 *  3. ¿Me pasé de algún presupuesto? — solo si requiere atención (por categoría)
 *  4. ¿Qué fue lo último que pasó?   — contexto reciente
 * Comparar meses y explorar la dona es navegación: vive en Historial.
 */
export function Dashboard() {
  const navigate = useNavigate()
  useData()
  const [month, setMonth] = useState(monthKey())
  const [verTodas, setVerTodas] = useState(false)

  const totals = monthTotals(month)
  const trend = balanceTrend(month)
  const recent = transactionsByMonth(month).slice(0, RECENT)
  const alertas = budgetStatus(month).filter((b) => b.pct >= ATENCION)
  const tope = monthlyBudgetStatus(month)

  const rows: Row[] = useMemo(() => {
    const base = expenseByCategory(month).flatMap(({ categoryId, total }) => {
      const category = getCategory(categoryId)
      return category ? [{ category, total }] : []
    })
    const top = base[0]?.total ?? 1
    return base.map(({ category, total }) => ({
      category,
      total,
      pct: Math.round((total / totals.expense) * 100),
      width: Math.round((total / top) * 100),
    }))
  }, [month, totals.expense])

  const visibles = verTodas ? rows : rows.slice(0, TOP)
  const ocultas = rows.slice(TOP)
  const montoOculto = ocultas.reduce((s, r) => s + r.total, 0)

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-nav">
      <MonthNav month={month} onChange={setMonth} />

      {/* 1 — ¿Cuánto dinero tengo? */}
      <section className="surface flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-muted-foreground">Balance disponible</span>
            <span className="text-[2.25rem] font-bold leading-none tracking-tight tabular-nums">
              {formatMoney(totals.balance)}
            </span>
          </div>
          {trend && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${
                  trend.pct >= 0
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-rose-50 text-rose-500'
                }`}
              >
                {trend.pct >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {trend.pct > 0 ? '+' : ''}
                {trend.pct}%
              </span>
              <span className="text-xs text-muted-foreground">vs {monthLabelCap(trend.previo)}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 divide-x divide-border border-t border-border pt-4">
          <Total
            label="Ingresos"
            value={totals.income}
            icon={<ArrowUpRight size={16} />}
            tone="text-emerald-600"
            badge="bg-emerald-50"
          />
          <Total
            label="Gastos"
            value={totals.expense}
            icon={<ArrowDownRight size={16} />}
            tone="text-rose-500"
            badge="bg-rose-50"
            pad
          />
        </div>

        {tope && <MonthlyBudget status={tope} />}
      </section>

      {/* 2 — ¿En qué se me está yendo? */}
      <section className="surface flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Gastos del mes</h2>
          {rows.length > TOP && (
            <button
              onClick={() => setVerTodas((v) => !v)}
              className="flex items-center gap-0.5 text-sm font-medium"
              style={{ color: LINK }}
            >
              {verTodas ? 'Ver menos' : 'Ver todas'}
              <ChevronRight
                size={16}
                className={`transition-transform ${verTodas ? '-rotate-90' : ''}`}
              />
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin gastos este mes.</p>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {visibles.map((r) => (
                <CategoryRow key={r.category.id} row={r} />
              ))}
            </div>
            {!verTodas && ocultas.length > 0 && (
              <button
                onClick={() => setVerTodas(true)}
                className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground transition active:bg-muted"
              >
                <span className="tabular-nums">
                  + {ocultas.length} {ocultas.length === 1 ? 'categoría' : 'categorías'} ·{' '}
                  {formatMoney(montoOculto)}
                </span>
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}
      </section>

      {/* 3 — Solo si requiere atención */}
      {alertas.length > 0 && (
        <section className="flex flex-col gap-2">
          {alertas.map((b) => {
            const st = budgetState(b.pct, b.over)
            return (
              <div
                key={b.category.id}
                className="surface flex items-center gap-3 p-4"
                style={{
                  boxShadow: `inset 3px 0 0 ${st.color}, 0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)`,
                }}
              >
                <AlertTriangle size={18} style={{ color: st.color }} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.category.name}</p>
                  <p className="text-xs" style={{ color: st.color }}>
                    {st.text} ·{' '}
                    <span className="tabular-nums">
                      {b.over
                        ? `${formatMoney(b.spent - b.budget)} de más`
                        : `quedan ${formatMoney(b.budget - b.spent)}`}
                    </span>
                  </p>
                </div>
                <span
                  className="shrink-0 text-base font-bold tabular-nums"
                  style={{ color: st.color }}
                >
                  {Math.round(b.pct * 100)}%
                </span>
              </div>
            )
          })}
        </section>
      )}

      {/* 4 — ¿Qué fue lo último que pasó? */}
      <section className="surface flex flex-col gap-1 p-5 pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Lo último</h2>
          <button
            onClick={() => navigate('/historial')}
            className="flex items-center gap-0.5 text-sm font-medium"
            style={{ color: LINK }}
          >
            Ver todo
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="-mx-2 divide-y divide-border">
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aún no hay movimientos.
            </p>
          ) : (
            recent.map((tx) => <TransactionItem key={tx.id} tx={tx} />)
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Avance del tope del mes, al pie de la tarjeta de balance.
 * No repite el gasto del mes (ya está arriba, en "Gastos"): dice el porcentaje,
 * cuánto queda y contra qué tope. La barra se llena al 100% cuando te pasaste —
 * el exceso se cuenta con el monto, no estirando la barra.
 */
function MonthlyBudget({ status }: { status: MonthlyBudgetStatus }) {
  const st = budgetState(status.pct, status.over)
  const pct = Math.round(status.pct * 100)
  const Icon = st.icon === 'alert' ? AlertTriangle : CheckCircle2

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">Presupuesto del mes</span>
        <span className="shrink-0 text-lg font-bold tabular-nums" style={{ color: st.color }}>
          {pct}%
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% del presupuesto del mes`}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: st.color }}
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <Icon size={14} className="shrink-0" style={{ color: st.color }} />
        <span className="font-medium" style={{ color: st.color }}>
          {st.text}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {status.over
            ? `· ${formatMoney(-status.remaining)} sobre los ${formatMoney(status.budget)}`
            : `· quedan ${formatMoney(status.remaining)} de ${formatMoney(status.budget)}`}
        </span>
      </p>
    </div>
  )
}

function Total({
  label,
  value,
  icon,
  tone,
  badge,
  pad,
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone: string
  badge: string
  pad?: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 ${pad ? 'pl-4' : 'pr-4'}`}>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${badge} ${tone}`}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="truncate text-sm font-semibold tabular-nums">{formatMoney(value)}</span>
      </span>
    </div>
  )
}

function CategoryRow({ row }: { row: Row }) {
  return (
    <div className="flex items-center gap-3">
      <CategoryIcon category={row.category} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate font-medium">{row.category.name}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {formatMoney(row.total)}
            <span className="ml-1.5 text-xs opacity-70">{row.pct}%</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{ width: `${row.width}%`, backgroundColor: row.category.color }}
          />
        </div>
      </div>
    </div>
  )
}
