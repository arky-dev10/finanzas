/**
 * ANDAMIO TEMPORAL — FASE A del frente «Resumen + Historial».
 *
 * El modelo financiero (cuentas, naturalezas, medios, céntimos) lo implementa
 * otro frente en `src/lib/*`. Mientras no esté en main, este archivo reproduce
 * el contrato acordado —mismos nombres, mismas formas de retorno— para poder
 * diseñar la UI y sacar evidencia con datos que cubren los casos difíciles:
 * cuenta con saldo pendiente, mes con devoluciones y ajustes en el historial.
 *
 * FASE B (cuando el modelo llegue a main): borrar este archivo y redirigir los
 * imports de Dashboard / History / TransactionItem / charts:
 *   selectores y tipos  → '@/lib/store' y '@/types'
 *   formatMoney(Short)  → '@/lib/format'   (ya reciben céntimos)
 * No debería hacer falta tocar nada más.
 *
 * Con `?saldo-ok` en la URL la cuenta Efectivo tiene su ajuste inicial y el
 * total pasa a ser confiable: sirve para comparar los dos estados.
 */
import { useSyncExternalStore } from 'react'
import { monthKey, shiftMonth } from '@/lib/format'

/* ---------- contrato ---------- */

export type TxNature = 'expense' | 'income' | 'refund' | 'adjustment'
export type CategoryKind = 'expense' | 'income'
export type AccountKind = 'bank' | 'cash'
export type Medium = 'yape' | 'plin' | 'card' | 'transfer' | 'other'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  /** Cuenta creada sin ajuste inicial: su saldo todavía no es confiable. */
  balancePending?: true
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: CategoryKind
  /** Presupuesto mensual en céntimos. */
  budget?: number
}

export interface Transaction {
  id: string
  amountCents: number
  nature: TxNature
  accountId: string
  categoryId?: string
  medium?: Medium
  date: string
  note?: string
}

/* ---------- montos en céntimos (los formatters ya los reciben así) ---------- */

const pen = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
})

export function formatMoney(cents: number): string {
  return pen.format(cents / 100)
}

export function formatMoneyShort(cents: number): string {
  const n = cents / 100
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`
  }
  return String(Math.round(n))
}

/* ---------- datos de ejemplo ---------- */

const CONFIGURADA = typeof location !== 'undefined' && new URLSearchParams(location.search).has('saldo-ok')

/** Fecha del mes actual desplazado `atras` meses. */
function d(atras: number, dia: string): string {
  return `${shiftMonth(monthKey(), -atras)}-${dia}`
}

const CATEGORIES: Category[] = [
  { id: 'c_transport', name: 'Transporte', icon: 'bus', color: '#2a78d6', type: 'expense' },
  { id: 'c_food', name: 'Comida', icon: 'utensils', color: '#eb6834', type: 'expense', budget: 25000 },
  { id: 'c_shopping', name: 'Compras', icon: 'shopping-bag', color: '#1baf7a', type: 'expense' },
  { id: 'c_services', name: 'Servicios', icon: 'zap', color: '#eda100', type: 'expense', budget: 18000 },
  { id: 'c_fun', name: 'Ocio', icon: 'gamepad-2', color: '#e87ba4', type: 'expense', budget: 10000 },
  { id: 'c_home', name: 'Vivienda', icon: 'home', color: '#4a3aa7', type: 'expense' },
  { id: 'c_health', name: 'Salud', icon: 'heart-pulse', color: '#e34948', type: 'expense' },
  { id: 'c_other_e', name: 'Otros', icon: 'more-horizontal', color: '#6b7280', type: 'expense' },
  { id: 'c_salary', name: 'Salario', icon: 'wallet', color: '#008300', type: 'income' },
  { id: 'c_other_i', name: 'Otros ingresos', icon: 'banknote', color: '#1baf7a', type: 'income' },
]

const ACCOUNTS: Account[] = [
  { id: 'a_bcp', name: 'BCP', kind: 'bank' },
  { id: 'a_cash', name: 'Efectivo', kind: 'cash', ...(CONFIGURADA ? {} : { balancePending: true as const }) },
]

/** Meses cerrados: sueldo + los gastos fijos, para que las barras tengan historia. */
function mesCerrado(atras: number, compras: number): Omit<Transaction, 'id'>[] {
  const base: Omit<Transaction, 'id'>[] = [
    { amountCents: 450000, nature: 'income', accountId: 'a_bcp', categoryId: 'c_salary', medium: 'transfer', date: d(atras, '02'), note: 'Sueldo' },
    { amountCents: 120000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_home', medium: 'transfer', date: d(atras, '05'), note: 'Alquiler' },
    { amountCents: 90000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', medium: 'card', date: d(atras, '11') },
    { amountCents: 19000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_services', medium: 'card', date: d(atras, '10'), note: 'Luz y agua' },
    { amountCents: 16000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_transport', medium: 'yape', date: d(atras, '17') },
  ]
  if (compras > 0) {
    base.push({ amountCents: compras, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_shopping', medium: 'card', date: d(atras, '21') })
  }
  return base
}

const SEED: Omit<Transaction, 'id'>[] = [
  // El ajuste que abre la historia: migración de los movimientos viejos a BCP.
  { amountCents: 200000, nature: 'adjustment', accountId: 'a_bcp', date: d(5, '01'), note: 'Saldo inicial' },
  ...mesCerrado(5, 185000),
  ...mesCerrado(4, 200000),
  ...mesCerrado(3, 175000),
  ...mesCerrado(2, 195000),
  ...mesCerrado(1, 0),

  // Mes en curso: sueldo, gastos por varios medios, dos devoluciones y un ajuste.
  { amountCents: 450000, nature: 'income', accountId: 'a_bcp', categoryId: 'c_salary', medium: 'transfer', date: d(0, '02'), note: 'Sueldo' },
  { amountCents: 120000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_home', medium: 'transfer', date: d(0, '05'), note: 'Alquiler' },
  { amountCents: 6850, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', medium: 'yape', date: d(0, '03'), note: 'Almuerzo con Ana' },
  { amountCents: 2400, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_transport', medium: 'yape', date: d(0, '05') },
  { amountCents: 18990, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_services', medium: 'card', date: d(0, '10'), note: 'Luz' },
  { amountCents: 14500, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', medium: 'card', date: d(0, '12'), note: 'Mercado' },
  { amountCents: 4500, nature: 'refund', accountId: 'a_bcp', categoryId: 'c_food', medium: 'yape', date: d(0, '14'), note: 'Ana me devolvió su parte' },
  { amountCents: 3150, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_transport', medium: 'yape', date: d(0, '18') },
  { amountCents: 5200, nature: 'expense', accountId: 'a_cash', categoryId: 'c_food', date: d(0, '20'), note: 'Menú del día' },
  { amountCents: 9600, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_fun', medium: 'yape', date: d(0, '22'), note: 'Cine' },
  { amountCents: 2500, nature: 'expense', accountId: 'a_cash', categoryId: 'c_transport', date: d(0, '24') },
  { amountCents: 24000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_health', medium: 'card', date: d(0, '25'), note: 'Consulta' },
  { amountCents: 32000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_shopping', medium: 'card', date: d(0, '27'), note: 'Zapatillas' },
  // Un ajuste puede restar: el signo lo lleva el monto.
  { amountCents: -3500, nature: 'adjustment', accountId: 'a_bcp', date: d(0, '28'), note: 'Comisión no registrada' },
  { amountCents: 18000, nature: 'refund', accountId: 'a_bcp', categoryId: 'c_shopping', medium: 'transfer', date: d(0, '29'), note: 'Devolución de la tienda' },
  // Reembolso de una consulta del mes pasado: cae en el mes en que ocurre y
  // deja a Salud en negativo. Es el caso raro que la UI tiene que soportar.
  { amountCents: 30000, nature: 'refund', accountId: 'a_bcp', categoryId: 'c_health', medium: 'transfer', date: d(0, '30'), note: 'Reembolso del seguro' },
  ...(CONFIGURADA
    ? [{ amountCents: 20500, nature: 'adjustment' as const, accountId: 'a_cash', date: d(0, '01'), note: 'Saldo inicial' }]
    : []),
]

interface Data {
  categories: Category[]
  accounts: Account[]
  transactions: Transaction[]
  monthlyBudget: number
  onboarded: boolean
}

let data: Data = {
  categories: CATEGORIES,
  accounts: ACCOUNTS,
  transactions: SEED.map((t, i) => ({ ...t, id: `seed_${i}` })),
  monthlyBudget: 350000,
  onboarded: true,
}

const listeners = new Set<() => void>()

function commit(next: Data) {
  data = next
  listeners.forEach((l) => l())
}

export function useData(): Data {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => data,
    () => data,
  )
}

export function getCategory(id: string): Category | undefined {
  return data.categories.find((c) => c.id === id)
}

export function getAccount(id: string): Account | undefined {
  return data.accounts.find((a) => a.id === id)
}

export function deleteTransaction(id: string) {
  commit({ ...data, transactions: data.transactions.filter((t) => t.id !== id) })
}

export function insertTransaction(tx: Transaction) {
  if (data.transactions.some((t) => t.id === tx.id)) return
  commit({ ...data, transactions: [tx, ...data.transactions] })
}

/* ---------- selectores ---------- */

export function transactionsByMonth(month: string): Transaction[] {
  return data.transactions
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** Gasto neto de devoluciones; los ajustes no existen para el análisis. */
export function monthTotals(month: string) {
  let income = 0
  let expense = 0
  for (const t of transactionsByMonth(month)) {
    if (t.nature === 'income') income += t.amountCents
    else if (t.nature === 'expense') expense += t.amountCents
    else if (t.nature === 'refund') expense -= t.amountCents
  }
  return { income, expense, balance: income - expense }
}

export function expenseByCategory(month: string) {
  const map = new Map<string, number>()
  for (const t of transactionsByMonth(month)) {
    if (!t.categoryId) continue
    if (t.nature === 'expense') map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountCents)
    else if (t.nature === 'refund') map.set(t.categoryId, (map.get(t.categoryId) ?? 0) - t.amountCents)
  }
  return [...map.entries()]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total)
}

export function lastMonthsTotals(count: number, endMonth: string = monthKey()) {
  const out: { month: string; income: number; expense: number }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonth(endMonth, -i)
    const { income, expense } = monthTotals(month)
    out.push({ month, income, expense })
  }
  return out
}

export function monthlyBudgetStatus(month: string) {
  const budget = data.monthlyBudget
  if (budget <= 0) return null
  const spent = monthTotals(month).expense
  return { budget, spent, remaining: budget - spent, pct: spent / budget, over: spent > budget }
}

export type MonthlyBudgetStatus = NonNullable<ReturnType<typeof monthlyBudgetStatus>>

export function budgetStatus(month: string) {
  const spent = new Map(expenseByCategory(month).map((e) => [e.categoryId, e.total]))
  return data.categories
    .filter((c) => c.type === 'expense' && typeof c.budget === 'number' && c.budget > 0)
    .map((category) => {
      const budget = category.budget as number
      const used = spent.get(category.id) ?? 0
      return { category, budget, spent: used, pct: used / budget, over: used > budget }
    })
    .sort((a, b) => b.pct - a.pct)
}

/* ---------- saldos ---------- */

export function accountBalanceCents(id: string): number {
  let total = 0
  for (const t of data.transactions) {
    if (t.accountId !== id) continue
    if (t.nature === 'expense') total -= t.amountCents
    else total += t.amountCents
  }
  return total
}

/**
 * Total de saldos de todas las cuentas. `reliable` es falso mientras alguna
 * cuenta no tenga configurado su saldo: el número sigue siendo lo mejor que
 * sabemos, pero no se presenta como verdad.
 */
export function totalInAccounts(): { totalCents: number; reliable: boolean } {
  return {
    totalCents: data.accounts.reduce((s, a) => s + accountBalanceCents(a.id), 0),
    reliable: data.accounts.every((a) => !a.balancePending),
  }
}
