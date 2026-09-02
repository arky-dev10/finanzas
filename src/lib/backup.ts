import type { Account, Category, Medium, Transaction, TxNature } from '@/types'

/**
 * v4: `budget` y `monthlyBudget` pasan a `budgetCents`/`monthlyBudgetCents`.
 * v3: montos en céntimos, cuentas y naturalezas (ADR 0001).
 * v2 agregó `monthlyBudget`. Todos se siguen importando.
 *
 * `monthStartDay` (ciclo mensual) entró SIN subir la versión: el bump importa
 * cuando cambia la semántica de LECTURA — como soles→céntimos, que sin
 * `CENTS_SINCE` re-multiplicaría la plata por 100. Un campo aditivo con
 * default seguro no la cambia: un respaldo viejo sin el campo se lee como 1
 * (mes calendario, comportamiento idéntico) y una app vieja que reciba un
 * respaldo nuevo simplemente lo ignora.
 */
export const BACKUP_VERSION = 4

/**
 * Desde v3 los montos YA vienen en céntimos. Ojo: la migración se decide contra
 * esta constante y no contra `BACKUP_VERSION`, porque cada versión nueva que no
 * cambie la unidad volvería a multiplicar por 100 la plata del usuario.
 */
const CENTS_SINCE = 3

export interface Backup {
  version: number
  exportedAt: string
  monthlyBudgetCents: number
  monthStartDay: number
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
}

export interface Data {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  /** Tope de gasto de todo el mes, en céntimos. 0 = sin tope. */
  monthlyBudgetCents: number
  /**
   * Día en que empieza el mes del usuario (1–28; nunca 29–31, que a febrero
   * no llegan). 1 = mes calendario. Con 28, "Septiembre" va del 28-ago al
   * 27-sep: el ciclo se etiqueta por el mes en que TERMINA, que es el mes
   * cuyo sueldo se gasta.
   */
  monthStartDay: number
  /**
   * Si ya pasó por la pantalla de bienvenida. No va en el respaldo: es estado
   * de la app, no plata. Sin esto, quien elige "Definirlo después" volvería a
   * ver la bienvenida en cada arranque.
   */
  onboarded: boolean
}

export const DEFAULT_ACCOUNT_ID = 'a_bcp'

/**
 * Las dos arrancan con el saldo pendiente de calibrar, porque no se conoce
 * ninguno de los dos. El de BCP es ficción hasta el primer ajuste: son los
 * movimientos que el usuario anotó, no lo que hay en el banco. Y el efectivo
 * tampoco es cero — es la plata de la billetera, que nadie contó todavía.
 *
 * Sembrar Efectivo como calibrada dejaba `reliable` en true apenas se calibraba
 * BCP, y el total se presentaba como exacto con la billetera afuera de la suma
 * (ADR 0001, D6).
 */
export function seedAccounts(): Account[] {
  return [
    { id: DEFAULT_ACCOUNT_ID, name: 'BCP', kind: 'bank', balancePending: true },
    { id: 'a_cash', name: 'Efectivo', kind: 'cash', balancePending: true },
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

const isAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** El presupuesto se llamaba `budget` hasta v3; desde v4 es `budgetCents`. */
function rawBudget(c: Record<string, unknown>): unknown {
  return c.budgetCents ?? c.budget
}

function isCategoryShape(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  const budget = rawBudget(c)
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.icon === 'string' &&
    typeof c.color === 'string' &&
    (c.type === 'expense' || c.type === 'income') &&
    (budget === undefined || isAmount(budget))
  )
}

/**
 * Reconstruye la categoría en vez de copiarla: así el `budget` viejo no queda
 * colgando al lado del `budgetCents` nuevo en el localStorage del usuario.
 */
function toCategory(raw: Record<string, unknown>, legacy: boolean): Category {
  const cat: Category = {
    id: raw.id as string,
    name: raw.name as string,
    icon: raw.icon as string,
    color: raw.color as string,
    type: raw.type as Category['type'],
  }
  const budget = rawBudget(raw)
  if (isAmount(budget)) cat.budgetCents = legacy ? Math.round(budget * 100) : budget
  return cat
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

/**
 * Limpia estados que el modelo declara imposibles pero que un archivo importado
 * puede traer igual. Limpiamos en vez de rechazar: son campos de más, no plata,
 * y tirar todo el respaldo por eso sería desproporcionado.
 *
 * El medio no aplica en efectivo (la plata en mano no se mueve por un canal), y
 * un ajuste con categoría es peligroso además de incoherente: `deleteCategory`
 * borra los movimientos de la categoría, así que se llevaría puesta la
 * calibración y el saldo de la cuenta se movería solo.
 */
function normalizeTransactions(transactions: Transaction[], accounts: Account[]): Transaction[] {
  const cash = new Set(accounts.filter((a) => a.kind === 'cash').map((a) => a.id))
  return transactions.map((t) => {
    const sobraMedio = t.medium !== undefined && cash.has(t.accountId)
    const sobraCategoria = t.nature === 'adjustment' && t.categoryId !== undefined
    if (!sobraMedio && !sobraCategoria) return t
    const limpio = { ...t }
    if (sobraMedio) delete limpio.medium
    if (sobraCategoria) delete limpio.categoryId
    return limpio
  })
}

/** El tope se llamaba `monthlyBudget` hasta v3; desde v4 es `monthlyBudgetCents`. */
function readMonthlyBudget(o: Record<string, unknown>, legacy: boolean): number {
  const raw = o.monthlyBudgetCents ?? o.monthlyBudget
  if (!isAmount(raw) || raw < 0) return 0
  return legacy ? Math.round(raw * 100) : raw
}

/**
 * Config, no plata: un valor que el modelo no admite (0, 29, un decimal, un
 * string) se normaliza a 1 en vez de rechazar el respaldo entero — el mismo
 * criterio que `readMonthlyBudget` con un tope inválido.
 */
function readMonthStartDay(o: Record<string, unknown>): number {
  const raw = o.monthStartDay
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 28 ? raw : 1
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
  if (!o.categories.every(isCategoryShape)) return null

  const version = typeof o.version === 'number' ? o.version : looksMigrated(o) ? BACKUP_VERSION : 1
  const legacy = version < CENTS_SINCE

  let transactions: Transaction[]
  if (legacy) {
    if (!o.transactions.every(isLegacyTransaction)) return null
    transactions = o.transactions.map(migrateTransaction)
  } else {
    if (!o.transactions.every(isTransaction)) return null
    transactions = o.transactions
  }
  const categories = o.categories.map((c) => toCategory(c, legacy))

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
    transactions: normalizeTransactions(transactions, accounts),
    // Los respaldos v1 no lo traían: quedan sin tope hasta que se defina uno.
    // No inventamos un monto que el usuario no eligió.
    monthlyBudgetCents: readMonthlyBudget(o, legacy),
    // Los respaldos anteriores al ciclo configurable no lo traían: mes
    // calendario, como siempre.
    monthStartDay: readMonthStartDay(o),
    // Tener datos guardados (o importar un respaldo) significa que no sos nuevo.
    onboarded: typeof o.onboarded === 'boolean' ? o.onboarded : true,
  }
}

export function toBackup(data: Data): Backup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    monthlyBudgetCents: data.monthlyBudgetCents,
    monthStartDay: data.monthStartDay,
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
