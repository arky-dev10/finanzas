import type { Category, Transaction } from '@/types'

export const BACKUP_VERSION = 1

export interface Backup {
  version: number
  exportedAt: string
  categories: Category[]
  transactions: Transaction[]
}

export interface Data {
  categories: Category[]
  transactions: Transaction[]
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
  return { categories: o.categories, transactions: o.transactions }
}

export function toBackup(data: Data): Backup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
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
