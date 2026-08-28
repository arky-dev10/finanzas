import { useSyncExternalStore } from 'react'
import { DEFAULT_MONTHLY_BUDGET } from '@/lib/budget'
import { monthKey, shiftMonth } from '@/lib/format'
import { parseData, type Data } from '@/lib/backup'
import type { Category, Transaction, TxType } from '@/types'

const KEY = 'finanzas-data-v1'

/**
 * Paleta validada con el validador de dataviz (adjacent pairs, modo claro):
 * CVD ΔE 9.1 (objetivo ≥8) · visión normal ΔE 19.6 (piso ≥15).
 * La anterior tenía violeta y azul indistinguibles con daltonismo deutan (ΔE 1.3).
 * Los 3 colores bajo 3:1 de contraste se compensan con etiquetas directas
 * (nombre + monto siempre visibles en la leyenda y en las barras).
 */
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'c_transport', name: 'Transporte', icon: 'bus', color: '#2a78d6', type: 'expense' },
  { id: 'c_food', name: 'Comida', icon: 'utensils', color: '#eb6834', type: 'expense' },
  { id: 'c_shopping', name: 'Compras', icon: 'shopping-bag', color: '#1baf7a', type: 'expense' },
  { id: 'c_services', name: 'Servicios', icon: 'zap', color: '#eda100', type: 'expense' },
  { id: 'c_fun', name: 'Ocio', icon: 'gamepad-2', color: '#e87ba4', type: 'expense' },
  { id: 'c_home', name: 'Vivienda', icon: 'home', color: '#4a3aa7', type: 'expense' },
  { id: 'c_health', name: 'Salud', icon: 'heart-pulse', color: '#e34948', type: 'expense' },
  { id: 'c_other_e', name: 'Otros', icon: 'more-horizontal', color: '#6b7280', type: 'expense' },
  { id: 'c_salary', name: 'Salario', icon: 'wallet', color: '#008300', type: 'income' },
  { id: 'c_other_i', name: 'Otros ingresos', icon: 'banknote', color: '#1baf7a', type: 'income' },
]

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      // Validamos en vez de confiar: datos corruptos rompían la app al arrancar.
      const parsed = parseData(JSON.parse(raw))
      if (parsed) return parsed
    }
  } catch {
    /* ignore */
  }
  return initial()
}

function initial(): Data {
  return {
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    monthlyBudget: DEFAULT_MONTHLY_BUDGET,
  }
}

let data: Data = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l())
}

function commit(next: Data) {
  data = next
  persist()
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Data {
  return data
}

export function useData(): Data {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Vuelve a las categorías por defecto y borra todos los movimientos. Devuelve lo anterior. */
export function resetData(): Data {
  const previo = data
  commit(initial())
  return previo
}

/** Reemplaza todo el contenido (importar respaldo). Devuelve lo anterior para deshacer. */
export function replaceData(next: Data): Data {
  const previo = data
  commit({
    categories: next.categories,
    transactions: next.transactions,
    monthlyBudget: next.monthlyBudget,
  })
  return previo
}

export function getCategory(id: string): Category | undefined {
  return data.categories.find((c) => c.id === id)
}

export function getTransaction(id: string): Transaction | undefined {
  return data.transactions.find((t) => t.id === id)
}

/* ---------- movimientos ---------- */

export function addTransaction(t: Omit<Transaction, 'id'>) {
  const tx: Transaction = { ...t, id: crypto.randomUUID() }
  commit({ ...data, transactions: [tx, ...data.transactions] })
}

/** Reinserta un movimiento conservando su id (para "Deshacer"). */
export function insertTransaction(tx: Transaction) {
  if (data.transactions.some((t) => t.id === tx.id)) return
  commit({ ...data, transactions: [tx, ...data.transactions] })
}

export function updateTransaction(id: string, patch: Partial<Omit<Transaction, 'id'>>) {
  commit({
    ...data,
    transactions: data.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  })
}

export function deleteTransaction(id: string) {
  commit({ ...data, transactions: data.transactions.filter((t) => t.id !== id) })
}

/* ---------- categorías ---------- */

export function addCategory(c: Omit<Category, 'id'>) {
  const cat: Category = { ...c, id: crypto.randomUUID() }
  commit({ ...data, categories: [...data.categories, cat] })
}

export function updateCategory(id: string, patch: Partial<Omit<Category, 'id'>>) {
  commit({
    ...data,
    categories: data.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  })
}

/**
 * Borra la categoría Y todos sus movimientos.
 * Devuelve lo borrado para poder restaurarlo con `restoreCategory`.
 */
export function deleteCategory(id: string): { category?: Category; transactions: Transaction[] } {
  const category = data.categories.find((c) => c.id === id)
  const transactions = data.transactions.filter((t) => t.categoryId === id)
  commit({
    ...data,
    categories: data.categories.filter((c) => c.id !== id),
    transactions: data.transactions.filter((t) => t.categoryId !== id),
  })
  return { category, transactions }
}

export function restoreCategory(category: Category, transactions: Transaction[]) {
  commit({
    ...data,
    categories: [...data.categories, category],
    transactions: [...transactions, ...data.transactions],
  })
}

/* ---------- tope mensual ---------- */

/** Cambia el tope de gasto de todo el mes. 0 lo desactiva. */
export function setMonthlyBudget(amount: number) {
  commit({ ...data, monthlyBudget: Math.max(0, amount) })
}

/* ---------- selectores ---------- */

export function transactionsByMonth(month: string): Transaction[] {
  return data.transactions
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function monthTotals(month: string) {
  const txs = transactionsByMonth(month)
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.type === 'income') income += t.amount
    else expense += t.amount
  }
  return { income, expense, balance: income - expense }
}

export function expenseByCategory(month: string) {
  const txs = transactionsByMonth(month).filter((t) => t.type === 'expense')
  const map = new Map<string, number>()
  for (const t of txs) {
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount)
  }
  return [...map.entries()]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total)
}

/** Totales de los últimos `count` meses, del más antiguo al más reciente. */
export function lastMonthsTotals(count: number, endMonth: string = monthKey()) {
  const out: { month: string; income: number; expense: number }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonth(endMonth, -i)
    const { income, expense } = monthTotals(month)
    out.push({ month, income, expense })
  }
  return out
}

/**
 * Variación del balance contra el mes anterior.
 * Solo tiene sentido si el mes anterior fue positivo: si fue 0 o negativo,
 * el porcentaje no significa nada y devolvemos null para no mostrarlo.
 */
export function balanceTrend(month: string) {
  const actual = monthTotals(month).balance
  const previo = monthTotals(shiftMonth(month, -1)).balance
  if (previo <= 0) return null
  return { pct: Math.round(((actual - previo) / previo) * 100), previo: shiftMonth(month, -1) }
}

/**
 * Avance del tope global del mes: cuánto del presupuesto total ya se gastó.
 * Devuelve null si no hay tope definido, para que la UI simplemente no lo muestre.
 */
export function monthlyBudgetStatus(month: string) {
  const budget = data.monthlyBudget
  if (budget <= 0) return null
  const spent = monthTotals(month).expense
  return {
    budget,
    spent,
    remaining: budget - spent,
    pct: spent / budget,
    over: spent > budget,
  }
}

export type MonthlyBudgetStatus = NonNullable<ReturnType<typeof monthlyBudgetStatus>>

/** Avance de presupuesto del mes, solo para categorías que tengan monto definido. */
export function budgetStatus(month: string) {
  const spent = new Map(expenseByCategory(month).map((e) => [e.categoryId, e.total]))
  return data.categories
    .filter((c) => c.type === 'expense' && typeof c.budget === 'number' && c.budget > 0)
    .map((category) => {
      const budget = category.budget as number
      const used = spent.get(category.id) ?? 0
      return {
        category,
        budget,
        spent: used,
        pct: used / budget,
        over: used > budget,
      }
    })
    .sort((a, b) => b.pct - a.pct)
}

export type { TxType }
