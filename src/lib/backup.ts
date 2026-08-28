import type { Category, Transaction } from '@/types'

/** v2 agregó `monthlyBudget`. Los respaldos v1 se siguen importando. */
export const BACKUP_VERSION = 2

export interface Backup {
  version: number
  exportedAt: string
  monthlyBudget: number
  categories: Category[]
  transactions: Transaction[]
}

export interface Data {
  categories: Category[]
  transactions: Transaction[]
  /** Tope de gasto de todo el mes. 0 = sin tope. */
  monthlyBudget: number
  /**
   * Si ya pasó por la pantalla de bienvenida. No va en el respaldo: es estado
   * de la app, no plata. Sin esto, quien elige "Definirlo después" volvería a
   * ver la bienvenida en cada arranque.
   */
  onboarded: boolean
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

function isTransaction(v: unknown): v is Transaction {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  return (
    typeof t.id === 'string' &&
    typeof t.amount === 'number' &&
    Number.isFinite(t.amount) &&
    typeof t.categoryId === 'string' &&
    (t.type === 'expense' || t.type === 'income') &&
    typeof t.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
    (t.note === undefined || typeof t.note === 'string')
  )
}

function isBudget(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/**
 * Valida datos que vienen de afuera (archivo importado o localStorage corrupto).
 * Acepta tanto el respaldo con `version` como el `{categories, transactions}` crudo.
 */
export function parseData(raw: unknown): Data | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.categories) || !Array.isArray(o.transactions)) return null
  if (!o.categories.every(isCategory)) return null
  if (!o.transactions.every(isTransaction)) return null
  return {
    categories: o.categories,
    transactions: o.transactions,
    // Los respaldos v1 no lo traían: quedan sin tope hasta que se defina uno.
    // No inventamos un monto que el usuario no eligió.
    monthlyBudget: isBudget(o.monthlyBudget) ? o.monthlyBudget : 0,
    // Tener datos guardados (o importar un respaldo) significa que no sos nuevo.
    onboarded: typeof o.onboarded === 'boolean' ? o.onboarded : true,
  }
}

export function toBackup(data: Data): Backup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    monthlyBudget: data.monthlyBudget,
    categories: data.categories,
    transactions: data.transactions,
  }
}

export function serialize(data: Data): string {
  return JSON.stringify(toBackup(data), null, 2)
}

export function backupFilename(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `finanzas-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}
