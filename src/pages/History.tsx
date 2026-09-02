import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { MonthNav } from '@/components/MonthNav'
import { TransactionItem } from '@/components/TransactionItem'
import { DonutChart, type Slice } from '@/components/charts/DonutChart'
import { MonthlyBars } from '@/components/charts/MonthlyBars'
import { CategoryIcon } from '@/components/CategoryIcon'
import { formatMoney } from '@/lib/format'
import {
  currentMonthKey,
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
  const navigate = useNavigate()
  // Sin esto la lista no se refrescaba al borrar un movimiento.
  useData()
  const [month, setMonth] = useState(currentMonthKey())
  const [selected, setSelected] = useState<string | null>(null)

  const totals = monthTotals(month)
  const txs = transactionsByMonth(month)
  const months = lastMonthsTotals(6, currentMonthKey())
  const porCategoria = expenseByCategory(month)

  /*
   * La dona reparte un total entre sus partes: solo admite gasto neto positivo.
   * Una categoría que cerró el mes en cero o en negativo (devolvieron más de lo
   * que se gastó) no es una porción — se nombra abajo, en texto.
   */
  const base: Slice[] = porCategoria.flatMap(({ categoryId, total }) => {
    const cat = getCategory(categoryId)
    if (!cat || total <= 0) return []
    return [{ id: cat.id, label: cat.name, value: total, color: cat.color }]
  })
  const slices: Slice[] =
    base.length <= MAX_SLICES
      ? base
      : [
          ...base.slice(0, MAX_SLICES - 1),
          {
            id: '__otros__',
            label: `Otros (${base.length - MAX_SLICES + 1})`,
            value: base.slice(MAX_SLICES - 1).reduce((s, r) => s + r.value, 0),
            color: '#6b7280',
          },
        ]
  /*
   * El % se mide contra el gasto neto del mes —el mismo denominador que usa el
   * Resumen—, no contra la suma de las porciones: si no, la misma categoría
   * mostraría dos porcentajes distintos en dos pantallas. Con una categoría en
   * negativo los arcos y los porcentajes se separan un punto o dos; el texto de
   * abajo lo explica.
   */
  const enLaDona = slices.reduce((s, x) => s + x.value, 0)
  const referencia = totals.expense > 0 ? totals.expense : enLaDona

  const devuelto = txs
    .filter((t) => t.nature === 'refund')
    .reduce((s, t) => s + t.amountCents, 0)
  const negativas = porCategoria
    .filter((e) => e.total < 0)
    .map((e) => getCategory(e.categoryId)?.name)
    .filter(Boolean) as string[]

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
          {/* «Neto» y no «Balance»: balance se confunde con el saldo real. */}
          <Stat label="Neto" value={totals.balance} tone="text-foreground" />
        </div>
      </section>

      {slices.length > 0 && (
        <section className="surface flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold">En qué se fue</h2>
          <DonutChart
            slices={slices}
            total={referencia}
            selectedId={selected}
            onSelect={setSelected}
          />
          <div className="flex flex-col gap-2">
            {slices.map((s) => {
              const cat = getCategory(s.id)
              const isSel = selected === s.id
              return (
                <div
                  key={s.id}
                  className={`flex items-center rounded-lg transition ${
                    isSel ? 'bg-muted' : ''
                  } ${selected !== null && !isSel ? 'opacity-45' : ''}`}
                >
                  <button
                    onClick={() => setSelected(isSel ? null : s.id)}
                    aria-pressed={isSel}
                    className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1.5 py-1.5 text-left ${
                      isSel ? '' : 'active:bg-muted/50'
                    }`}
                  >
                    {cat ? (
                      <CategoryIcon category={cat} size="sm" />
                    ) : (
                      <span
                        className="h-8 w-8 shrink-0 rounded-lg"
                        style={{ backgroundColor: `${s.color}26` }}
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.label}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {formatMoney(s.value)}
                      <span className="ml-1.5 text-xs opacity-70">
                        {Math.round((s.value / referencia) * 100)}%
                      </span>
                    </span>
                  </button>
                  {/*
                    El tap de la fila ya está tomado: filtra la dona, que es lo
                    que la dona promete. La navegación al detalle necesita su
                    propio objetivo, y solo aparece en la fila elegida para no
                    llenar la leyenda de chevrones. «Otros» no navega: agrupa
                    varias categorías y no tiene página propia.
                  */}
                  {isSel && cat && (
                    <button
                      onClick={() => navigate(`/categoria/${cat.id}?mes=${month}`)}
                      aria-label={`Ver el detalle de ${cat.name}`}
                      className="mr-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition active:bg-background"
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {(devuelto > 0 || negativas.length > 0) && (
            <p className="border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              {devuelto > 0 && (
                <>
                  Gasto neto: se descontaron{' '}
                  <span className="tabular-nums">{formatMoney(devuelto)}</span> en devoluciones.{' '}
                </>
              )}
              {negativas.length > 0 && (
                <>
                  {negativas.join(' y ')} {negativas.length === 1 ? 'quedó' : 'quedaron'} en
                  negativo este mes, así que no {negativas.length === 1 ? 'entra' : 'entran'} en la
                  dona.
                </>
              )}
            </p>
          )}
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
