import type {
  Account,
  Card,
  CardBrand,
  CardKind,
  Category,
  Medium,
  Transaction,
  TxNature,
  Wallet,
  WalletProvider,
} from '@/types'

/**
 * v5: cuentas `credit` (deuda), tarjetas y billeteras Yape/Plin (ADR 0004).
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
 *
 * v5 SÍ sube por eso: `cards` y `wallets` son aditivos y no habrían bastado,
 * pero `kind: 'credit'` cambia qué significa un saldo — una app vieja que
 * sumara esa cuenta a «En cuentas» contaría la deuda como si fuera plata. En
 * la práctica ni la suma: su validador solo acepta `bank | cash` y rechaza el
 * respaldo entero, que es el fallo seguro.
 */
export const BACKUP_VERSION = 5

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
  cards: Card[]
  wallets: Wallet[]
  categories: Category[]
  transactions: Transaction[]
}

export interface Data {
  accounts: Account[]
  /** Tarjetas de débito y crédito: identidad, no saldo (ver `types.ts`). */
  cards: Card[]
  /** Yape/Plin con su cuenta de origen declarada. */
  wallets: Wallet[]
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
const NATURES: readonly string[] = [
  'expense',
  'income',
  'refund',
  'adjustment',
  'transfer',
] satisfies TxNature[]
const KINDS: readonly string[] = ['bank', 'cash', 'credit'] satisfies Account['kind'][]
const CARD_KINDS: readonly string[] = ['debit', 'credit'] satisfies CardKind[]
const BRANDS: readonly string[] = ['visa', 'mastercard', 'amex', 'diners'] satisfies CardBrand[]
const PROVIDERS: readonly string[] = ['yape', 'plin'] satisfies WalletProvider[]

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Día del mes tal como lo fija el banco: 1–31, sin acotar a 28 (ver `types.ts`). */
const isDayOfMonth = (v: unknown): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31

function isAccount(v: unknown): v is Account {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  if (typeof a.id !== 'string' || typeof a.name !== 'string') return false
  if (!KINDS.includes(a.kind as string)) return false
  if (a.balancePending !== undefined && a.balancePending !== true) return false
  if (a.lastMedium !== undefined && !MEDIUMS.includes(a.lastMedium as string)) return false
  if (a.issuer !== undefined && typeof a.issuer !== 'string') return false
  // La línea es plata: entero en céntimos, nunca negativa.
  if (a.creditLimitCents !== undefined && !(Number.isInteger(a.creditLimitCents) && (a.creditLimitCents as number) >= 0))
    return false
  if (a.closingDay !== undefined && !isDayOfMonth(a.closingDay)) return false
  if (a.dueDay !== undefined && !isDayOfMonth(a.dueDay)) return false
  return a.statementConfirmedOn === undefined || isDate(a.statementConfirmedOn)
}

function isCard(v: unknown): v is Card {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    CARD_KINDS.includes(c.kind as string) &&
    typeof c.accountId === 'string' &&
    (c.brand === undefined || BRANDS.includes(c.brand as string)) &&
    (c.last4 === undefined || (typeof c.last4 === 'string' && /^\d{4}$/.test(c.last4)))
  )
}

function isWallet(v: unknown): v is Wallet {
  if (typeof v !== 'object' || v === null) return false
  const w = v as Record<string, unknown>
  return (
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    PROVIDERS.includes(w.provider as string) &&
    typeof w.accountId === 'string' &&
    (w.cardId === undefined || typeof w.cardId === 'string')
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

function isTransaction(v: unknown): v is Transaction {
  if (typeof v !== 'object' || v === null) return false
  const t = v as Record<string, unknown>
  if (typeof t.id !== 'string' || typeof t.accountId !== 'string') return false
  if (!isDate(t.date)) return false
  if (typeof t.nature !== 'string' || !NATURES.includes(t.nature)) return false
  if (!Number.isInteger(t.amountCents)) return false
  // Solo un ajuste puede ser negativo: un gasto negativo sumaría al saldo.
  if (t.nature !== 'adjustment' && (t.amountCents as number) < 0) return false
  /*
   * La transferencia es el único movimiento con dos cuentas, y la segunda es
   * obligatoria: sin destino la plata sale del origen y no llega a ningún
   * lado. Y no puede ser la misma — mover plata a su propia cuenta no es nada.
   */
  if (t.nature === 'transfer') {
    if (typeof t.toAccountId !== 'string' || t.toAccountId === t.accountId) return false
  } else if (t.toAccountId !== undefined) {
    return false
  }
  // La categoría es obligatoria salvo en ajustes y transferencias, que no
  // pertenecen a ninguna: no son gasto ni ingreso.
  if (t.nature === 'adjustment' || t.nature === 'transfer') {
    if (t.categoryId !== undefined && typeof t.categoryId !== 'string') return false
  } else if (typeof t.categoryId !== 'string') {
    return false
  }
  if (t.medium !== undefined && !MEDIUMS.includes(t.medium as string)) return false
  if (t.cardId !== undefined && typeof t.cardId !== 'string') return false
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
 * un ajuste o una transferencia con categoría es peligroso además de
 * incoherente: `deleteCategory` borra los movimientos de la categoría, así que
 * se llevaría puesta la calibración —o el pago de una tarjeta— y los saldos de
 * las cuentas se moverían solos.
 */
function normalizeTransactions(
  transactions: Transaction[],
  accounts: Account[],
  cards: Card[],
): Transaction[] {
  const cash = new Set(accounts.filter((a) => a.kind === 'cash').map((a) => a.id))
  const cardIds = new Set(cards.map((c) => c.id))
  return transactions.map((t) => {
    const sobraMedio = t.medium !== undefined && cash.has(t.accountId)
    const sobraCategoria =
      (t.nature === 'adjustment' || t.nature === 'transfer') && t.categoryId !== undefined
    // La tarjeta es una etiqueta: si no existe se cae la etiqueta, nunca el
    // movimiento. Un movimiento es plata; borrarlo movería un saldo real.
    const sobraTarjeta = t.cardId !== undefined && !cardIds.has(t.cardId)
    if (!sobraMedio && !sobraCategoria && !sobraTarjeta) return t
    const limpio = { ...t }
    if (sobraMedio) delete limpio.medium
    if (sobraCategoria) delete limpio.categoryId
    if (sobraTarjeta) delete limpio.cardId
    return limpio
  })
}

/**
 * Tarjetas y billeteras apuntan a cuentas; un respaldo editado a mano puede
 * traer referencias rotas. Se descartan las que quedaron sin casa en vez de
 * rechazar el respaldo: son etiquetas, no plata.
 *
 * En la billetera la cuenta es la verdad y la tarjeta solo la etiqueta, así
 * que una tarjeta que no existe —o que cuelga de otra cuenta— se cae sola y
 * el Yape sigue funcionando contra su cuenta.
 */
function linkCardsAndWallets(
  accounts: Account[],
  cards: unknown[],
  wallets: unknown[],
): { cards: Card[]; wallets: Wallet[] } {
  const accountIds = new Set(accounts.map((a) => a.id))
  const validCards = (cards.filter(isCard) as Card[]).filter((c) => accountIds.has(c.accountId))
  const byId = new Map(validCards.map((c) => [c.id, c]))
  const validWallets = (wallets.filter(isWallet) as Wallet[])
    .filter((w) => accountIds.has(w.accountId))
    .map((w) => {
      const card = w.cardId === undefined ? undefined : byId.get(w.cardId)
      if (card !== undefined && card.accountId === w.accountId) return w
      const limpia = { ...w }
      delete limpia.cardId
      return limpia
    })
  return { cards: validCards, wallets: validWallets }
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

  // Aditivos (v5): un respaldo anterior simplemente no los trae y se lee como
  // "todavía no cargaste tus tarjetas", que es la verdad. A diferencia de las
  // cuentas, acá no rechazamos por una entrada corrupta: una tarjeta rota es
  // una etiqueta perdida, no un movimiento sin dónde vivir.
  const { cards, wallets } = linkCardsAndWallets(
    accounts,
    Array.isArray(o.cards) ? o.cards : [],
    Array.isArray(o.wallets) ? o.wallets : [],
  )

  return {
    accounts,
    cards,
    wallets,
    categories,
    transactions: normalizeTransactions(transactions, accounts, cards),
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
    cards: data.cards,
    wallets: data.wallets,
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
