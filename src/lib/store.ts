import { useSyncExternalStore } from 'react'
import { monthKey, shiftMonth, todayISO } from '@/lib/format'
import { BACKUP_VERSION, parseData, seedAccounts, type Data } from '@/lib/backup'
import type { Account, Category, Medium, Transaction } from '@/types'

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
    accounts: seedAccounts(),
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    monthlyBudget: 0,
    onboarded: false,
  }
}

let data: Data = load()
const listeners = new Set<() => void>()

function persist() {
  try {
    // Guardamos `version`: sin ella `parseData` no puede distinguir los datos
    // en céntimos de los viejos en soles, y los migraría una segunda vez.
    localStorage.setItem(KEY, JSON.stringify({ version: BACKUP_VERSION, ...data }))
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

/**
 * Vuelve a las categorías por defecto y borra todos los movimientos.
 * Deja `onboarded` en false a propósito: "empezar de cero" te devuelve a la
 * bienvenida, y el "Deshacer" del toast restaura el flag y te trae de vuelta.
 */
export function resetData(): Data {
  const previo = data
  commit(initial())
  return previo
}

/** Reemplaza todo el contenido (importar respaldo). Devuelve lo anterior para deshacer. */
export function replaceData(next: Data): Data {
  const previo = data
  commit({
    accounts: next.accounts,
    categories: next.categories,
    transactions: next.transactions,
    monthlyBudget: next.monthlyBudget,
    onboarded: next.onboarded,
  })
  return previo
}

export function getCategory(id: string): Category | undefined {
  return data.categories.find((c) => c.id === id)
}

export function getAccount(id: string): Account | undefined {
  return data.accounts.find((a) => a.id === id)
}

export function getTransaction(id: string): Transaction | undefined {
  return data.transactions.find((t) => t.id === id)
}

/* ---------- movimientos ---------- */

/** El efectivo no se mueve por un canal: el medio no aplica en cuentas `cash`. */
function stripMediumOnCash(tx: Transaction): Transaction {
  if (tx.medium === undefined || getAccount(tx.accountId)?.kind !== 'cash') return tx
  const limpio = { ...tx }
  delete limpio.medium
  return limpio
}

/** El medio elegido queda como default de la cuenta para la próxima vez. */
function rememberMedium(accounts: Account[], accountId: string, medium: Medium | undefined): Account[] {
  if (medium === undefined) return accounts
  return accounts.map((a) => (a.id === accountId ? { ...a, lastMedium: medium } : a))
}

export function addTransaction(t: Omit<Transaction, 'id'>) {
  const tx = stripMediumOnCash({ ...t, id: crypto.randomUUID() })
  commit({
    ...data,
    accounts: rememberMedium(data.accounts, tx.accountId, tx.medium),
    transactions: [tx, ...data.transactions],
  })
}

/** Reinserta un movimiento conservando su id (para "Deshacer"). */
export function insertTransaction(tx: Transaction) {
  if (data.transactions.some((t) => t.id === tx.id)) return
  commit({ ...data, transactions: [tx, ...data.transactions] })
}

export function updateTransaction(id: string, patch: Partial<Omit<Transaction, 'id'>>) {
  const previo = data.transactions.find((t) => t.id === id)
  if (!previo) return
  // Normalizamos sobre el resultado: el patch puede mover el movimiento a
  // Efectivo, y ahí el medio que traía deja de tener sentido.
  const tx = stripMediumOnCash({ ...previo, ...patch })
  commit({
    ...data,
    accounts: rememberMedium(data.accounts, tx.accountId, tx.medium),
    transactions: data.transactions.map((t) => (t.id === id ? tx : t)),
  })
}

export function deleteTransaction(id: string) {
  commit({ ...data, transactions: data.transactions.filter((t) => t.id !== id) })
}

/* ---------- cuentas ---------- */

/** Cuánto suma o resta un movimiento al saldo de su cuenta. */
function signedCents(t: Transaction): number {
  return t.nature === 'expense' ? -t.amountCents : t.amountCents
}

/** Saldo de la cuenta: todos sus movimientos, de todos los meses, ajustes incluidos. */
export function accountBalanceCents(accountId: string): number {
  let total = 0
  for (const t of data.transactions) {
    if (t.accountId === accountId) total += signedCents(t)
  }
  return total
}

/**
 * "En cuentas": la suma de todos los saldos. No es el Disponible — todavía no
 * descuenta compromisos ni deuda. `reliable` es false mientras alguna cuenta
 * siga sin su ajuste inicial: ahí el total es una cuenta a medias, no un saldo.
 */
export function totalInAccounts(): { totalCents: number; reliable: boolean } {
  let totalCents = 0
  let reliable = true
  for (const a of data.accounts) {
    totalCents += accountBalanceCents(a.id)
    if (a.balancePending) reliable = false
  }
  return { totalCents, reliable }
}

/**
 * Calibra una cuenta contra la realidad: anota el delta que falta para llegar
 * al saldo que el usuario ve en su banco (o cuenta en su bolsillo), en vez de
 * inventar un gasto o un ingreso. Si ya cuadraba no anota nada, pero igual da
 * el saldo por configurado: un "Ajuste S/ 0.00" en el historial sería ruido.
 */
export function addAdjustment(accountId: string, targetBalanceCents: number, date: string = todayISO()) {
  // Sin cuenta el ajuste sería un movimiento huérfano: se listaría en el
  // historial sin entrar en ningún saldo.
  if (getAccount(accountId) === undefined) return
  const delta = targetBalanceCents - accountBalanceCents(accountId)
  const accounts = data.accounts.map((a) => {
    if (a.id !== accountId || a.balancePending === undefined) return a
    const calibrada = { ...a }
    delete calibrada.balancePending
    return calibrada
  })
  const ajuste: Transaction = {
    id: crypto.randomUUID(),
    amountCents: delta,
    nature: 'adjustment',
    accountId,
    date,
  }
  commit({
    ...data,
    accounts,
    transactions: delta === 0 ? data.transactions : [ajuste, ...data.transactions],
  })
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

/** Cambia el tope de gasto de todo el mes, en céntimos. 0 lo desactiva. */
export function setMonthlyBudget(cents: number) {
  commit({ ...data, monthlyBudget: Math.max(0, cents) })
}

/** Cierra la bienvenida. `cents` en 0 = "definirlo después". */
export function completeOnboarding(cents: number) {
  commit({ ...data, monthlyBudget: Math.max(0, cents), onboarded: true })
}

/* ---------- selectores ---------- */

export function transactionsByMonth(month: string): Transaction[] {
  return data.transactions
    .filter((t) => t.date.startsWith(month))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/**
 * Ingreso y gasto NETO del mes, en céntimos: la devolución resta del gasto en
 * vez de sumar a los ingresos, y el ajuste no aparece — calibra un saldo, no
 * es plata que entró o salió de la vida del usuario.
 */
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

/**
 * Gasto neto por categoría (gastos − devoluciones del mes). Puede dar 0 o
 * negativo si te devolvieron más de lo que gastaste ahí este mes: el selector
 * lo dice tal cual y es la pantalla la que decide si eso se grafica.
 */
export function expenseByCategory(month: string) {
  const map = new Map<string, number>()
  for (const t of transactionsByMonth(month)) {
    if (t.categoryId === undefined) continue
    if (t.nature === 'expense') map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amountCents)
    else if (t.nature === 'refund') map.set(t.categoryId, (map.get(t.categoryId) ?? 0) - t.amountCents)
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
