import { AlertTriangle, CheckCircle2, ChevronLeft, Pencil, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CategoryIcon } from '@/components/CategoryIcon'
import { CategoryMonthlyBars } from '@/components/charts/MonthlyBars'
import { DEVOLUCION } from '@/components/colors'
import { MonthNav } from '@/components/MonthNav'
import { TransactionItem } from '@/components/TransactionItem'
import { budgetState } from '@/lib/budget'
import { formatMoney, shiftMonth } from '@/lib/format'
import { budgetStatus, currentMonthKey, getCategory, transactionsByMonth, useData } from '@/lib/store'
import type { Category, CategoryKind } from '@/types'

const MESES_EVOLUCION = 6

/**
 * Gasto neto (o ingreso) de UNA categoría en UN mes. Calculado acá y no en
 * lib/store.ts: es la misma lógica nature-aware de `monthTotals`/
 * `expenseByCategory` pero para un mes y una categoría arbitrarios, algo
 * que hoy no expone ningún selector — no había uno que pedir prestado.
 */
function categoryTotal(month: string, categoryId: string, kind: CategoryKind): number {
  let total = 0
  for (const t of transactionsByMonth(month)) {
    if (t.categoryId !== categoryId) continue
    if (kind === 'expense') {
      if (t.nature === 'expense') total += t.amountCents
      else if (t.nature === 'refund') total -= t.amountCents
    } else if (t.nature === 'income') {
      total += t.amountCents
    }
  }
  return total
}

const MES_RE = /^\d{4}-\d{2}$/

export function CategoryDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  useData()
  const category = getCategory(id)
  // Quien enlaza acá desde un mes específico (la fila de una categoría en un
  // mes pasado del Historial, por ejemplo) puede pasar `?mes=YYYY-MM` para
  // abrir directo en ese mes en vez de saltar siempre al mes actual.
  const mesParam = searchParams.get('mes')
  const [month, setMonth] = useState(mesParam && MES_RE.test(mesParam) ? mesParam : currentMonthKey())

  if (!category) return <CategoriaNoEncontrada />

  const isExpense = category.type === 'expense'
  const spent = categoryTotal(month, category.id, category.type)
  const meses = Array.from({ length: MESES_EVOLUCION }, (_, i) => {
    const m = shiftMonth(currentMonthKey(), -(MESES_EVOLUCION - 1 - i))
    return { month: m, total: categoryTotal(m, category.id, category.type) }
  })
  const movimientos = transactionsByMonth(month).filter((t) => t.categoryId === category.id)

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-nav">
      <Cabecera category={category} />

      <section className="surface flex flex-col gap-4 p-5">
        <MonthNav month={month} onChange={setMonth} />

        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            {isExpense ? 'Gastado este mes' : 'Ingresado este mes'}
          </span>
          <span
            className="text-3xl font-bold leading-none tracking-tight tabular-nums"
            style={{ color: spent < 0 ? DEVOLUCION : undefined }}
          >
            {formatMoney(spent)}
          </span>
        </div>

        <ResumenDelMes category={category} month={month} spent={spent} />
      </section>

      <section className="surface flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold">Últimos {MESES_EVOLUCION} meses</h2>
        <CategoryMonthlyBars data={meses} selected={month} onSelect={setMonth} color={category.color} />
      </section>

      <section className="surface flex flex-col gap-1 p-5 pb-2">
        <h2 className="text-base font-semibold">
          Movimientos
          {movimientos.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {movimientos.length}
            </span>
          )}
        </h2>
        <div className="-mx-2 divide-y divide-border">
          {movimientos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin movimientos este mes.
            </p>
          ) : (
            movimientos.map((tx) => <TransactionItem key={tx.id} tx={tx} />)
          )}
        </div>
      </section>
    </div>
  )
}

function Cabecera({ category }: { category: Category }) {
  const navigate = useNavigate()
  return (
    <header className="flex items-center gap-3">
      <button
        onClick={() => navigate(-1)}
        aria-label="Volver"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <ChevronLeft size={22} />
      </button>
      <CategoryIcon category={category} size="lg" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold">{category.name}</h1>
        <p className="text-xs text-muted-foreground">
          {category.type === 'expense' ? 'Categoría de gasto' : 'Categoría de ingreso'}
        </p>
      </div>
      <Link
        to={`/categorias?editar=${category.id}`}
        aria-label={`Editar ${category.name}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <Pencil size={17} />
      </Link>
    </header>
  )
}

/**
 * Tres estados posibles, en este orden de prioridad:
 *  1. Neto negativo (te devolvieron más de lo que gastaste): pasa de verdad
 *     en categorías de poco movimiento con una devolución grande. No es un
 *     error ni "0%" del presupuesto — es su propio estado, en azul.
 *  2. Sin presupuesto: no hay contra qué medir el avance.
 *  3. Presupuesto normal: el mismo semáforo que usa el Resumen.
 * Las categorías de ingreso no tienen presupuesto — el número de arriba ya
 * dice todo lo que hay que decir.
 */
function ResumenDelMes({
  category,
  month,
  spent,
}: {
  category: Category
  month: string
  spent: number
}) {
  if (spent < 0) {
    return (
      <div className="border-t border-border pt-4">
        <div className="flex items-start gap-2.5 rounded-xl p-3" style={{ backgroundColor: `${DEVOLUCION}14` }}>
          <Undo2 size={16} className="mt-0.5 shrink-0" style={{ color: DEVOLUCION }} />
          <p className="text-xs leading-relaxed" style={{ color: DEVOLUCION }}>
            Te devolvieron <span className="font-semibold">{formatMoney(-spent)}</span> más de lo
            que gastaste en {category.name} este mes.
          </p>
        </div>
      </div>
    )
  }

  if (category.type !== 'expense') return null

  const status = budgetStatus(month).find((b) => b.category.id === category.id)
  if (!status) {
    return (
      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3">
          <p className="text-xs text-muted-foreground">Sin presupuesto para esta categoría.</p>
          <Link
            to={`/categorias?editar=${category.id}`}
            className="shrink-0 text-xs font-medium text-primary"
          >
            Definir
          </Link>
        </div>
      </div>
    )
  }

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
        aria-valuetext={`${pct}% del presupuesto de ${category.name}`}
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
            ? `· ${formatMoney(status.spentCents - status.budgetCents)} de más`
            : `· quedan ${formatMoney(status.budgetCents - status.spentCents)} de ${formatMoney(status.budgetCents)}`}
        </span>
      </p>
    </div>
  )
}

function CategoriaNoEncontrada() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-nav">
      <button
        onClick={() => navigate(-1)}
        aria-label="Volver"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <ChevronLeft size={22} />
      </button>
      <div className="surface flex flex-col items-center gap-2 p-8 text-center">
        <p className="text-sm font-medium">Esta categoría ya no existe.</p>
        <p className="text-xs text-muted-foreground">Puede que la hayan borrado.</p>
        <Link
          to="/categorias"
          className="mt-2 text-sm font-medium text-primary underline underline-offset-4"
        >
          Ir a Categorías
        </Link>
      </div>
    </div>
  )
}
