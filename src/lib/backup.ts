import type { Account, Category, Medium, Transaction, TxNature } from '@/types'

/**
 * v3: montos en céntimos, cuentas y naturalezas (ADR 0001).
 * v2 agregó `monthlyBudget`. Los respaldos v1 y v2 se siguen importando.
 */
export const BACKUP_VERSION = 3

export interface Backup {
  version: number
  exportedAt: string
  monthlyBudget: number
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
}

export interface Data {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  /** Tope de gasto de todo el mes, en céntimos. 0 = sin tope. */
  monthlyBudget: number
  /**
   * Si ya pasó por la pantalla de bienvenida. No va en el respaldo: es estado
   * de la app, no plata. Sin esto, quien elige "Definirlo después" volvería a
   * ver la bienvenida en cada arranque.
   */
  onboarded: boolean
}

/**
 * BCP arranca con saldo pendiente porque su saldo derivado es ficción hasta el
 * primer ajuste: son los movimientos que el usuario anotó, no lo que hay en el
 * banco. Efectivo arranca en cero de verdad, sin movimientos que lo desmientan.
 */
export const DEFAULT_ACCOUNT_ID = 'a_bcp'

export function seedAccounts(): Account[] {
  return [
    { id: DEFAULT_ACCOUNT_ID, name: 'BCP', kind: 'bank', balancePending: true },
    { id: 'a_cash', name: 'Efectivo', kind: 'cash' },
  ]
}

const MEDIUMS: readonly string[] = ['yape', 'plin', 'card', 'transfer', 'other'] satisfies Medium[]
const NATURES: readonly string[] = ['expense', 'income', 'refund', 'adjustment'] satisfies TxNature[]

function isAccount(v: unknown): v is Account {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  return (
    typeof a.id === 'string' &&
    typeof a.name === 'string' &&
    (a.kind === 'bank' || a.kind === 'cash') &&
    (a.balancePending === undefined || a.balancePending === true) &&
    (a.lastMedium === undefined || MEDIUMS.includes(a.lastMedium as string))
  )
}

function isCategory(v: unknown): v is Category {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.icon === 'string' &&
    typeof c.color === 'string' &&
    (c.type === 'expense' || c.type === 'income') &&
    (c.budget === undefined || (typeof c.budget === 'number' && Number.isFinite(c.budget)))
  )
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

function isTransaction(v: unknown): v is Transaction {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  if (typeof t.id !== 'string' || typeof t.accountId !== 'string') return false
  if (!isDate(t.date)) return false
  if (typeof t.nature !== 'string' || !NATURES.includes(t.nature)) return false
  if (!Number.isInteger(t.amountCents)) return false
  // Solo un ajuste puede ser negativo: un gasto negativo sumaría al saldo.
  if (t.nature !== 'adjustment' && (t.amountCents as number) < 0) return false
  // La categoría es obligatoria salvo en ajustes, que no pertenecen a ninguna.
  if (t.nature === 'adjustment') {
    if (t.categoryId !== undefined && typeof t.categoryId !== 'string') return false
  } else if (typeof t.categoryId !== 'string') {
    return false
  }
  if (t.medium !== undefined && !MEDIUMS.includes(t.medium as string)) return false
  return t.note === undefined || typeof t.note === 'string'
}

/* ---------- migración desde v1/v2 (soles, sin cuentas) ---------- */

interface LegacyTransaction {
  id: string
  amount: number
  categoryId: string
  type: 'expense' | 'income'
  date: string
  note?: string
}

function isLegacyTransaction(v: unknown): v is LegacyTransaction {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.amount === 'number' &&
    Number.isFinite(t.amount) &&
    t.amount >= 0 &&
    typeof t.categoryId === 'string' &&
    (t.type === 'expense' || t.type === 'income') &&
    isDate(t.date) &&
    (t.note === undefined || typeof t.note === 'string')
  )
}

/** Todo el historial pre-cuentas va a BCP; el ajuste inicial absorbe la diferencia. */
function migrateTransaction(t: LegacyTransaction): Transaction {
  return {
    id: t.id,
    amountCents: Math.round(t.amount * 100),
    nature: t.type,
    accountId: DEFAULT_ACCOUNT_ID,
    categoryId: t.categoryId,
    date: t.date,
    ...(t.note === undefined ? {} : { note: t.note }),
  }
}

function migrateCategory(c: Category): Category {
  return c.budget === undefined ? c : { ...c, budget: Math.round(c.budget * 100) }
}

/**
 * El localStorage viejo no guardaba `version`. Antes de asumir que es v2 y
 * multiplicar todo por 100, miramos la forma: si ya hay cuentas o `amountCents`,
 * los datos están migrados y volver a convertirlos inflaría la plata 100 veces.
 */
function looksMigrated(o: Record<string, unknown>): boolean {
  if (Array.isArray(o.accounts)) return true
  return (
    Array.isArray(o.transactions) &&
    o.transactions.some((t) => typeof t === 'object' && t !== null && 'amountCents' in t)
  )
}

function isBudget(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/**
 * Valida datos que vienen de afuera (archivo importado o localStorage corrupto)
 * y los migra a v3 si hace falta. Acepta tanto el respaldo con `version` como
 * el `{categories, transactions}` crudo que guardaba la app.
 */
export function parseData(raw: unknown): Data | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.categories) || !Array.isArray(o.transactions)) return null
  if (!o.categories.every(isCategory)) return null

  const version = typeof o.version === 'number' ? o.version : looksMigrated(o) ? BACKUP_VERSION : 1
  const legacy = version < BACKUP_VERSION

  let transactions: Transaction[]
  let categories: Category[]
  if (legacy) {
    if (!o.transactions.every(isLegacyTransaction)) return null
    transactions = o.transactions.map(migrateTransaction)
    categories = o.categories.map(migrateCategory)
  } else {
    if (!o.transactions.every(isTransaction)) return null
    transactions = o.transactions
    categories = o.categories
  }

  const budget = isBudget(o.monthlyBudget) ? o.monthlyBudget : 0

  // Sin cuentas no hay dónde poner los movimientos, así que sembramos; pero si
  // vienen y están corruptas rechazamos todo, como con las categorías: pisarlas
  // con las semillas perdería las cuentas reales y dejaría cada movimiento
  // apuntando a una cuenta que ya no existe.
  if (o.accounts !== undefined && !(Array.isArray(o.accounts) && o.accounts.every(isAccount))) {
    return null
  }
  const accounts = Array.isArray(o.accounts) && o.accounts.length > 0 ? o.accounts : seedAccounts()

  return {
    accounts,
    categories,
    transactions,
    // Los respaldos v1 no lo traían: quedan sin tope hasta que se defina uno.
    // No inventamos un monto que el usuario no eligió.
    monthlyBudget: legacy ? Math.round(budget * 100) : budget,
    // Tener datos guardados (o importar un respaldo) significa que no sos nuevo.
    onboarded: typeof o.onboarded === 'boolean' ? o.onboarded : true,
  }
}

export function toBackup(data: Data): Backup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    monthlyBudget: data.monthlyBudget,
    accounts: data.accounts,
    categories: data.categories,
    transactions: data.transactions,
  }
}

export function serialize(data: Data): string {
  return JSON.stringify(toBackup(data), null, 2)
}

export function backupFilename(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `kumi-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}
