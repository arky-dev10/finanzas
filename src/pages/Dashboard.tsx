import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  Landmark,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { MonthNav } from '@/components/MonthNav'
import { CategoryIcon } from '@/components/CategoryIcon'
import { TransactionItem } from '@/components/TransactionItem'
import { budgetState } from '@/lib/budget'
import { formatMoney, monthLabel, shiftMonth } from '@/lib/format'
import {
  accountBalanceCents,
  budgetStatus,
  currentMonthKey,
  expenseByCategory,
  getCategory,
  monthlyBudgetStatus,
  monthTotals,
  totalDebtCents,
  totalInAccounts,
  monthEntries,
  useData,
  type MonthlyBudgetStatus,
} from '@/lib/store'
import type { Account, Category } from '@/types'

const TOP = 3
const RECENT = 5
/** Un presupuesto solo aparece si ya te pasaste o estás por pasarte. */
const ATENCION = 0.9
/*
 * Las acciones secundarias («Ver todas», «Ver todo») no llevan color propio:
 * el azul de antes no existe en la paleta de marca, y la salvia no pasa AA como
 * texto sobre crema. Jerarquía por peso tipográfico + el chevron como afordancia.
 */
const ACCION = 'flex items-center gap-0.5 text-sm font-semibold text-foreground'

interface Row {
  category: Category
  total: number
  pct: number | null
  width: number
}

/**
 * Cuatro niveles, en este orden:
 *  1. ¿Cuánta plata tengo?           — «En cuentas»: la suma de los saldos
 *                                      reales, con el desglose por cuenta;
 *                                      debajo, lo que pasó en el mes
 *  2. ¿En qué se me está yendo?      — inmediatamente debajo
 *  3. ¿Me pasé de algún presupuesto? — solo si requiere atención (por categoría)
 *  4. ¿Qué fue lo último que pasó?   — contexto reciente
 * Comparar meses y explorar la dona es navegación: vive en Historial.
 */
export function Dashboard() {
  const navigate = useNavigate()
  const { accounts } = useData()
  const [month, setMonth] = useState(currentMonthKey())
  const [verTodas, setVerTodas] = useState(false)

  const totals = monthTotals(month)
  const recent = monthEntries(month).slice(0, RECENT)
  const alertas = budgetStatus(month).filter((b) => b.pct >= ATENCION)
  const tope = monthlyBudgetStatus(month)
  const { totalCents, reliable } = totalInAccounts()
  /*
   * Solo las cuentas del usuario: una tarjeta de crédito guarda deuda, no
   * plata, y `totalInAccounts` la saltea. Listarla en el desglose mostraría
   * una línea que no está en la suma de arriba (ADR 0004, D1).
   */
  const propias = accounts.filter((a) => a.kind !== 'credit')
  const pendientes = propias.filter((a) => a.balancePending)
  const deuda = totalDebtCents()
  /*
   * Recién migrado, ninguna cuenta tiene saldo configurado: el total no es
   * S/ 0.00, es desconocido. Mostrar un cero sería la primera mentira que ve
   * el usuario, así que la tarjeta cambia de cara y pide lo que le falta.
   */
  const sinConfigurar = pendientes.length === propias.length

  /*
   * Contra el mes anterior comparamos el GASTO, no el saldo: «En cuentas» es
   * un stock (cuánto hay hoy), no un flujo, y su variación mensual no dice
   * nada útil. El gasto sí responde «¿me estoy portando mejor que el mes
   * pasado?». Solo se muestra si el mes anterior tuvo gasto.
   */
  const mesPrevio = shiftMonth(month, -1)
  const gastoPrevio = monthTotals(mesPrevio).expense
  const variacion =
    gastoPrevio > 0 ? Math.round(((totals.expense - gastoPrevio) / gastoPrevio) * 100) : null

  const base = expenseByCategory(month).flatMap(({ categoryId, total }) => {
    const category = getCategory(categoryId)
    return category ? [{ category, total }] : []
  })
  const mayor = Math.max(...base.map((b) => b.total), 1)
  const rows: Row[] = base.map(({ category, total }) => ({
    category,
    total,
    // El % se calcula sobre el gasto neto del mes; si una categoría lo supera
    // (puede pasar con devoluciones grandes en otra) el número miente: mejor no mostrarlo.
    pct:
      totals.expense > 0 && total > 0 && total <= totals.expense
        ? Math.round((total / totals.expense) * 100)
        : null,
    width: total > 0 ? Math.round((total / mayor) * 100) : 0,
  }))

  const visibles = verTodas ? rows : rows.slice(0, TOP)
  const ocultas = rows.slice(TOP)
  const montoOculto = ocultas.reduce((s, r) => s + r.total, 0)

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-nav">
      <MonthNav month={month} onChange={setMonth} />

      {/* 1 — ¿Cuánta plata tengo? */}
      <section className="surface flex flex-col gap-4 p-5">
        {sinConfigurar ? (
          <div className="-mt-1 flex flex-col items-start gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">En cuentas</span>
              <h2 className="text-2xl font-bold leading-tight tracking-tight">
                Falta configurar tus saldos
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Anotá cuánto tenés hoy en {propias.map((a) => a.name).join(' y ')} y el total
                aparece acá. Kumi ya guarda tus movimientos: lo que falta es el punto de partida.
              </p>
            </div>
            <button
              onClick={() => navigate('/cuentas')}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition active:scale-[0.98]"
            >
              Configurar saldos
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => navigate('/cuentas')}
            className="-mx-2 -mt-2 rounded-xl px-2 pb-1 pt-2 text-left transition active:bg-muted/50"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  En cuentas
                  {month !== currentMonthKey() && <span className="ml-1.5 opacity-70">· hoy</span>}
                </span>
                <span className="text-[2.25rem] font-bold leading-none tracking-tight tabular-nums">
                  {formatMoney(totalCents)}
                </span>
              </span>
              <ChevronRight size={20} className="mt-1 shrink-0 text-muted-foreground" />
            </span>

            <span className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {propias.map((a) => (
                <Saldo key={a.id} account={a} />
              ))}
            </span>

            {/*
              El total ya no incluye las cuentas sin configurar (decisión D6), así
              que no es «aproximado»: es exacto y le falta algo. Decir cuál.
            */}
            {!reliable && (
              <span className="mt-2 block text-xs text-muted-foreground">
                No incluye {pendientes.map((a) => a.name).join(' y ')} —{' '}
                {pendientes.length === 1 ? 'falta configurar su saldo' : 'faltan sus saldos'}.
              </span>
            )}

            {/*
              La deuda se muestra al lado, nunca restada: «En cuentas» es lo que
              tenés. Descontarla acá sería estrenar el Disponible a medias, sin
              los compromisos del ciclo que le faltan (ADR 0004, D8).
            */}
            {deuda.reliable && deuda.totalCents !== 0 && (
              <span className="mt-2 flex items-center gap-1.5 text-xs">
                <CreditCard size={13} className="shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Debes</span>
                <span className="font-medium tabular-nums text-rose-600">
                  {formatMoney(deuda.totalCents)}
                </span>
                <span className="text-muted-foreground/70">· sin descontar</span>
              </span>
            )}
          </button>
        )}

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

        {variacion !== null && variacion !== 0 && (
          <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            {variacion < 0 ? (
              <TrendingDown size={14} className="shrink-0" />
            ) : (
              <TrendingUp size={14} className="shrink-0" />
            )}
            <span>
              <span className="font-medium tabular-nums text-foreground">
                {Math.abs(variacion)}%
              </span>{' '}
              {variacion < 0 ? 'menos' : 'más'} de gasto que en {monthLabel(mesPrevio)}
            </span>
          </p>
        )}

        {tope && <MonthlyBudget status={tope} />}
      </section>

      {/* 2 — ¿En qué se me está yendo? */}
      <section className="surface flex flex-col gap-4 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Gastos del mes</h2>
          {rows.length > TOP && (
            <button
              onClick={() => setVerTodas((v) => !v)}
              className={ACCION}
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
                <CategoryRow key={r.category.id} row={r} month={month} />
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
                        ? `${formatMoney(b.spentCents - b.budgetCents)} de más`
                        : `quedan ${formatMoney(b.budgetCents - b.spentCents)}`}
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
            className={ACCION}
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
            recent.map((e) => (
              <TransactionItem key={`${e.tx.id}-${e.installment ?? 0}`} {...e} />
            ))
          )}
        </div>
      </section>
    </div>
  )
}

/**
 * Saldo de una cuenta, en la línea de desglose del total.
 * Una cuenta sin ajuste inicial no muestra número: mostrarlo sería inventar
 * una precisión que no tenemos.
 */
function Saldo({ account }: { account: Account }) {
  const Icon = account.kind === 'bank' ? Landmark : Banknote
  // `Saldo` solo se usa con cuentas del usuario: la deuda de una tarjeta no
  // pertenece al desglose de «En cuentas» y tiene su propia línea.
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Icon size={13} className="shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{account.name}</span>
      {account.balancePending ? (
        <span className="italic text-muted-foreground/80">Sin configurar</span>
      ) : (
        <span className="font-medium tabular-nums">
          {formatMoney(accountBalanceCents(account.id))}
        </span>
      )}
    </span>
  )
}

/**
 * Avance del tope del mes, al pie de la tarjeta.
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
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, backgroundColor: st.color }}
        />
      </div>

      <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <Icon size={14} className="shrink-0" style={{ color: st.color }} />
        <span className="font-medium" style={{ color: st.color }}>
          {st.text}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {status.over
            ? `· ${formatMoney(-status.remainingCents)} sobre los ${formatMoney(status.budgetCents)}`
            : `· quedan ${formatMoney(status.remainingCents)} de ${formatMoney(status.budgetCents)}`}
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

/**
 * Una categoría del mes. Con gasto neto negativo (devolvieron más de lo que se
 * gastó) la fila se queda: es información honesta. Pierde la barra y el % —no
 * es una parte del gasto— y se muestra en tono neutro.
 */
function CategoryRow({ row, month }: { row: Row; month: string }) {
  const navigate = useNavigate()
  const negativa = row.total <= 0
  /*
   * La fila entera navega al detalle, sin chevron: en esta app una fila que se
   * toca no lo lleva (las de «Lo último» tampoco). El chevron queda para donde
   * el tap ya está ocupado, como la leyenda de la dona en Historial.
   * Va con el mes que se está viendo, no con el actual: los montos de la fila
   * son de ese mes y el detalle tiene que abrir donde el usuario está mirando.
   */
  return (
    <button
      onClick={() => navigate(`/categoria/${row.category.id}?mes=${month}`)}
      className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-1 text-left transition active:bg-muted/50"
    >
      <CategoryIcon category={row.category} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2 text-sm">
          <span className="truncate font-medium">{row.category.name}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {formatMoney(row.total)}
            {row.pct !== null && <span className="ml-1.5 text-xs opacity-70">{row.pct}%</span>}
          </span>
        </span>
        {negativa ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            Las devoluciones superaron al gasto
          </span>
        ) : (
          <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full"
              style={{ width: `${row.width}%`, backgroundColor: row.category.color }}
            />
          </span>
        )}
      </span>
    </button>
  )
}
