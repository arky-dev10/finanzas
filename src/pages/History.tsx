import { useMemo, useState } from 'react'
import { MonthNav } from '@/components/MonthNav'
import { TransactionItem } from '@/components/TransactionItem'
import { DonutChart, type Slice } from '@/components/charts/DonutChart'
import { MonthlyBars } from '@/components/charts/MonthlyBars'
import { CategoryIcon } from '@/components/CategoryIcon'
import { formatMoney, monthKey } from '@/lib/format'
import {
  expenseByCategory,
  getCategory,
  lastMonthsTotals,
  monthTotals,
  transactionsByMonth,
  useData,
} from '@/lib/store'

/** Más de 6 porciones se vuelven ilegibles: el resto se agrupa en "Otros". */
const MAX_SLICES = 6

export function History() {
  // Sin esto la lista no se refrescaba al borrar un movimiento.
  useData()
  const [month, setMonth] = useState(monthKey())
  const [selected, setSelected] = useState<string | null>(null)

  const totals = monthTotals(month)
  const txs = transactionsByMonth(month)
  const months = lastMonthsTotals(6, monthKey())

  const slices: Slice[] = useMemo(() => {
    const base: Slice[] = expenseByCategory(month).flatMap(({ categoryId, total }) => {
      const cat = getCategory(categoryId)
      if (!cat) return []
      return [{ id: cat.id, label: cat.name, value: total, color: cat.color }]
    })
    if (base.length <= MAX_SLICES) return base
    const rest = base.slice(MAX_SLICES - 1)
    return [
      ...base.slice(0, MAX_SLICES - 1),
      {
        id: '__otros__',
        label: `Otros (${rest.length})`,
        value: rest.reduce((s, r) => s + r.value, 0),
        color: '#6b7280',
      },
    ]
  }, [month])

  function changeMonth(m: string) {
    setMonth(m)
    setSelected(null)
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-nav">
      <h1 className="px-1 text-lg font-semibold">Historial</h1>

      <section className="surface flex flex-col gap-4 p-5">
        <MonthNav month={month} onChange={changeMonth} />
        <MonthlyBars data={months} selected={month} onSelect={changeMonth} />
        <div className="grid grid-cols-3 divide-x divide-border border-t border-border pt-3">
          <Stat label="Ingresos" value={totals.income} tone="text-emerald-600" />
          <Stat label="Gastos" value={totals.expense} tone="text-rose-500" />
          <Stat label="Balance" value={totals.balance} tone="text-foreground" />
        </div>
      </section>

      {slices.length > 0 && (
        <section className="surface flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">En qué se fue</h2>
          <DonutChart slices={slices} selectedId={selected} onSelect={setSelected} />
          <div className="flex flex-col gap-2">
            {slices.map((s) => {
              const cat = getCategory(s.id)
              const isSel = selected === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(isSel ? null : s.id)}
                  aria-pressed={isSel}
                  className={`flex items-center gap-3 rounded-lg px-1.5 py-1.5 text-left transition ${
                    isSel ? 'bg-muted' : 'active:bg-muted/50'
                  } ${selected !== null && !isSel ? 'opacity-45' : ''}`}
                >
                  {cat ? (
                    <CategoryIcon category={cat} size="sm" />
                  ) : (
                    <span
                      className="h-8 w-8 shrink-0 rounded-lg"
                      style={{ backgroundColor: `${s.color}26` }}
                    />
                  )}
                  <span className="flex-1 truncate text-sm font-medium">{s.label}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {formatMoney(s.value)}
                    <span className="ml-1.5 text-xs opacity-70">
                      {Math.round((s.value / totals.expense) * 100)}%
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="surface flex flex-col gap-1 p-5 pb-2">
        <h2 className="text-base font-semibold">
          Movimientos
          {txs.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
              {txs.length}
            </span>
          )}
        </h2>
        <div className="-mx-2 divide-y divide-border">
          {txs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin movimientos este mes.
            </p>
          ) : (
            txs.map((tx) => <TransactionItem key={tx.id} tx={tx} />)
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-[13px] font-semibold tabular-nums ${tone}`}>{formatMoney(value)}</span>
    </div>
  )
}
