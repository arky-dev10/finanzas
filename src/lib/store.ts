import { useSyncExternalStore } from 'react'
import { cycleRange, monthKeyFor, monthsBetween, shiftMonth, todayISO } from '@/lib/format'
import { cardCycle, installmentCents, monthlyOccurrence, type CardCycle } from '@/lib/cards'
import { BACKUP_VERSION, parseData, seedAccounts, type Data } from '@/lib/backup'
import type {
  Account,
  Card,
  CardBrand,
  Category,
  Medium,
  Reminder,
  Transaction,
  Wallet,
  WalletProvider,
} from '@/types'

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
    cards: [],
    wallets: [],
    reminders: [],
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    monthlyBudgetCents: 0,
    monthStartDay: 1,
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
 * Los datos de ahora, para código que no es un componente (la sincronización).
 * En React usá `useData()`: esto no re-renderiza cuando cambian.
 */
export function getData(): Data {
  return data
}

/** Avisa cada vez que los datos cambian. Devuelve la función para desuscribirse. */
export function subscribeToData(listener: () => void): () => void {
  return subscribe(listener)
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
    cards: next.cards,
    wallets: next.wallets,
    reminders: next.reminders,
    categories: next.categories,
    transactions: next.transactions,
    monthlyBudgetCents: next.monthlyBudgetCents,
    monthStartDay: next.monthStartDay,
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

export function getCard(id: string): Card | undefined {
  return data.cards.find((c) => c.id === id)
}

export function getTransaction(id: string): Transaction | undefined {
  return data.transactions.find((t) => t.id === id)
}

/* ---------- movimientos ---------- */

/**
 * Deja el movimiento en una forma que el modelo admita, antes de guardarlo.
 *
 * - El efectivo no se mueve por un canal: el medio no aplica en cuentas `cash`.
 * - Una transferencia no tiene categoría (no es gasto ni ingreso) y no puede
 *   ir a su propia cuenta. Y solo una transferencia lleva destino: si el
 *   usuario cambia la naturaleza al editar, el destino viejo queda colgado y
 *   sumaría plata a una cuenta que ya no tiene nada que ver.
 */
function normalize(tx: Transaction): Transaction {
  const limpio = { ...tx }
  if (limpio.medium !== undefined && getAccount(limpio.accountId)?.kind === 'cash') {
    delete limpio.medium
  }
  if (limpio.nature === 'transfer') {
    delete limpio.categoryId
    if (limpio.toAccountId === limpio.accountId) delete limpio.toAccountId
  } else {
    delete limpio.toAccountId
  }
  // Una cuota sola es una compra normal, y nada que no sea un gasto se paga de
  // a partes: un plan colgado ahí solo confundiría a los selectores.
  if (limpio.nature !== 'expense' || (limpio.installmentCount ?? 0) < 2) {
    delete limpio.installmentCount
  }
  return limpio
}

/** El medio elegido queda como default de la cuenta para la próxima vez. */
function rememberMedium(accounts: Account[], accountId: string, medium: Medium | undefined): Account[] {
  if (medium === undefined) return accounts
  return accounts.map((a) => (a.id === accountId ? { ...a, lastMedium: medium } : a))
}

export function addTransaction(t: Omit<Transaction, 'id'>) {
  const tx = normalize({ ...t, id: crypto.randomUUID() })
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
  // Normalizamos sobre el RESULTADO, no sobre el patch: mover el movimiento a
  // Efectivo deja sin sentido el medio que traía, y cambiarle la naturaleza a
  // gasto deja sin sentido el destino.
  const tx = normalize({ ...previo, ...patch })
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

/**
 * Cuánto suma o resta un movimiento al saldo de la cuenta DE LA QUE SALE.
 * Exportada porque es también el signo con el que se muestra en la lista: una
 * devolución entra, un ajuste puede ir para cualquier lado, una transferencia
 * sale (de acá; a la otra cuenta entra, y de eso se encarga `signedCentsFor`).
 */
export function signedCents(t: Transaction): number {
  return t.nature === 'expense' || t.nature === 'transfer' ? -t.amountCents : t.amountCents
}

/**
 * Cuánto le suma o le resta un movimiento a UNA cuenta concreta. Existe por la
 * transferencia, el único movimiento que toca dos: resta en el origen y suma
 * en el destino, con el mismo monto y en el mismo instante.
 */
export function signedCentsFor(t: Transaction, accountId: string): number {
  if (t.nature === 'transfer' && t.toAccountId === accountId) return t.amountCents
  return t.accountId === accountId ? signedCents(t) : 0
}

/** Saldo de la cuenta: todos sus movimientos, de todos los meses, ajustes incluidos. */
export function accountBalanceCents(accountId: string): number {
  let total = 0
  for (const t of data.transactions) {
    total += signedCentsFor(t, accountId)
  }
  return total
}

/**
 * "En cuentas": la suma de los saldos. No es el Disponible — todavía no
 * descuenta compromisos ni deuda.
 *
 * Las cuentas sin ajuste inicial quedan FUERA de la suma: su saldo es
 * desconocido, no cero. Sumarlas metería sus gastos sin su saldo inicial, y el
 * total podría salir más chico que la única cuenta que sí conocemos — se lee
 * como un error de suma. `reliable` avisa que falta calibrar alguna; al
 * calibrarla, el ajuste absorbe la diferencia y la cuenta entra completa.
 */
export function totalInAccounts(): { totalCents: number; reliable: boolean } {
  let totalCents = 0
  let reliable = true
  for (const a of data.accounts) {
    // La tarjeta de crédito guarda deuda, no plata del usuario: sumarla acá
    // haría que deber más se viera como tener más (ADR 0004, D1).
    if (a.kind === 'credit') continue
    if (a.balancePending) reliable = false
    else totalCents += accountBalanceCents(a.id)
  }
  return { totalCents, reliable }
}

/**
 * La cuenta del último movimiento REAL, para preseleccionarla al registrar
 * (D1 del ADR 0001). Ni los ajustes ni las transferencias cuentan como uso:
 * calibrar un saldo no es gastar ahí, y mover plata entre cuentas propias
 * tampoco. Sin el filtro, ajustar la deuda de una tarjeta —o pagarla— la
 * dejaba de default y el siguiente gasto se iba a crédito sin pedirlo.
 */
export function lastUsedAccountId(): string | undefined {
  return data.transactions.find((t) => t.nature !== 'adjustment' && t.nature !== 'transfer')
    ?.accountId
}

/* ---------- deuda ---------- */

/**
 * Lo que se debe en una tarjeta, en positivo: el saldo de su cuenta `credit`
 * está en negativo por naturaleza. Puede dar negativo si pagaste de más — eso
 * es saldo a favor, y no se recorta a cero porque es plata que existe.
 */
export function accountDebtCents(accountId: string): number {
  const balance = accountBalanceCents(accountId)
  // `-0` es un número distinto de `0` en JS y `Intl` lo formatea "−S/ 0.00":
  // una tarjeta pagada al día se vería debiendo menos que nada.
  return balance === 0 ? 0 : -balance
}

/** Deuda total: la suma de lo que se debe en todas las tarjetas de crédito. */
export function totalDebtCents(): { totalCents: number; reliable: boolean } {
  let totalCents = 0
  let reliable = true
  for (const a of data.accounts) {
    if (a.kind !== 'credit') continue
    if (a.balancePending) reliable = false
    else totalCents += accountDebtCents(a.id)
  }
  return { totalCents, reliable }
}

/**
 * El estado de una tarjeta de crédito en su ciclo: cuánto hay que pagar, para
 * cuándo, y cuánto se lleva consumido del período que todavía no cierra.
 *
 * Los dos montos parten la deuda total sin solaparse ni dejar hueco:
 *   deuda = facturado + en curso
 * y eso vale SIEMPRE, porque el en curso se calcula como el resto. Definirlo
 * sumando los consumos posteriores al cierre daba lo mismo en el caso normal
 * pero mentía en los bordes: la calibración inicial de la tarjeta, fechada
 * dentro del período abierto, se contaba como consumo y el «en curso» salía
 * más grande que la deuda entera.
 *
 * Devuelve `null` si la tarjeta no tiene ciclo cargado: sin cierre ni
 * vencimiento no hay «por pagar» que calcular, y no se inventa uno.
 */
export interface CardStatus {
  cycle: CardCycle
  /** Lo facturado que sigue pendiente: la deuda al cierre menos lo abonado después. */
  billedCents: number
  /** Consumo del período abierto, que se factura en el próximo cierre. */
  runningCents: number
  debtCents: number
  /** Si el usuario ya confirmó este estado de cuenta contra el papel del banco. */
  confirmed: boolean
}

/** La deuda de la tarjeta contando solo lo que ocurrió hasta `date`, inclusive. */
function debtAsOf(accountId: string, date: string): number {
  let total = 0
  for (const t of data.transactions) {
    if (t.date <= date) total += signedCentsFor(t, accountId)
  }
  return -total
}

export function creditCardStatus(accountId: string, today: string = todayISO()): CardStatus | null {
  const account = getAccount(accountId)
  if (account?.kind !== 'credit') return null
  if (account.closingDay === undefined || account.dueDay === undefined) return null

  const cycle = cardCycle(account.closingDay, account.dueDay, today)

  // Lo que ENTRA después del cierre paga lo ya facturado. Lo que sale no se
  // suma acá: el consumo en curso sale por diferencia, más abajo.
  let abonado = 0
  for (const t of data.transactions) {
    if (t.date <= cycle.closedTo) continue
    const efecto = signedCentsFor(t, accountId)
    if (efecto > 0) abonado += efecto
  }

  // Deber menos que nada no es una deuda, es saldo a favor: por eso el recorte.
  const billedCents = Math.max(0, debtAsOf(accountId, cycle.closedTo) - abonado)
  const debtCents = accountDebtCents(accountId)
  return {
    cycle,
    billedCents,
    runningCents: debtCents - billedCents,
    debtCents,
    confirmed: account.statementConfirmedOn === cycle.closedTo,
  }
}

/**
 * El usuario declara lo que dice el estado de cuenta y Kumi anota la diferencia
 * como cargos del banco: membresía, ITF, seguro de desgravamen, intereses (ADR
 * 0004, D5). Es el mismo gesto —y el mismo principio— que `addAdjustment`: la
 * realidad la declara el usuario y la app anota el delta, sin inventar un gasto.
 *
 * El ajuste va fechado EN EL CIERRE, no hoy: esos cargos pertenecen al período
 * facturado, y fecharlos hoy los metería en el consumo en curso, que es
 * justamente lo que todavía no está facturado.
 */
export function confirmStatement(
  accountId: string,
  amountCents: number,
  today: string = todayISO(),
): boolean {
  const status = creditCardStatus(accountId, today)
  if (status === null) return false

  const delta = amountCents - debtAsOf(accountId, status.cycle.closedTo)
  const ajuste: Transaction = {
    id: crypto.randomUUID(),
    // El saldo de una cuenta de crédito es negativo: más deuda es menos saldo.
    amountCents: -delta,
    nature: 'adjustment',
    accountId,
    date: status.cycle.closedTo,
  }
  commit({
    ...data,
    accounts: data.accounts.map((a) =>
      a.id === accountId ? { ...a, statementConfirmedOn: status.cycle.closedTo } : a,
    ),
    transactions: delta === 0 ? data.transactions : [ajuste, ...data.transactions],
  })
  return true
}

/**
 * Cuánto queda libre de la línea. Es plata del banco, no del usuario: se
 * muestra como dato de la tarjeta y jamás entra al Disponible (ADR 0004).
 * `null` cuando no se cargó la línea: no la inventamos.
 */
export function creditAvailableCents(accountId: string): number | null {
  const account = getAccount(accountId)
  if (account?.kind !== 'credit' || account.creditLimitCents === undefined) return null
  return account.creditLimitCents - accountDebtCents(accountId)
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

/* ---------- cuentas, tarjetas y billeteras: crear, editar, borrar ---------- */

/** Las cuentas con plata del usuario. Las `credit` guardan deuda y quedan fuera. */
export function spendableAccounts(): Account[] {
  return data.accounts.filter((a) => a.kind !== 'credit')
}

export function cardsForAccount(accountId: string): Card[] {
  return data.cards.filter((c) => c.accountId === accountId)
}

/** El plástico solo se identifica por los últimos cuatro; el número entero nunca se guarda. */
function cleanLast4(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const digits = raw.replace(/\D/g, '').slice(-4)
  return digits.length === 4 ? digits : undefined
}

/** Descarta las claves en `undefined` para no dejarlas colgando en el JSON guardado. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/**
 * Una cuenta nueva nace con el saldo pendiente de calibrar: nadie contó todavía
 * lo que hay adentro, y cero sería una afirmación que la app no puede hacer.
 *
 * Las cuentas `credit` NO se crean acá: nacen junto a su tarjeta en
 * `addCreditCard`, que es lo que garantiza que no exista una línea sin plástico.
 */
export function addAccount(input: {
  name: string
  kind: 'bank' | 'cash'
  issuer?: string
}): Account {
  const account: Account = compact({
    id: crypto.randomUUID(),
    name: input.name.trim(),
    kind: input.kind,
    balancePending: true,
    issuer: input.issuer?.trim() || undefined,
  })
  commit({ ...data, accounts: [...data.accounts, account] })
  return account
}

/**
 * `kind` queda fuera del patch a propósito: pasar de banco a efectivo dejaría
 * movimientos con un medio que ahí no aplica, y de/hacia `credit` rompería el
 * 1:1 con la tarjeta. Si te equivocaste de tipo, la cuenta se borra y se rehace.
 */
export function updateAccount(id: string, patch: Partial<Omit<Account, 'id' | 'kind'>>) {
  commit({
    ...data,
    accounts: data.accounts.map((a) => (a.id === id ? compact({ ...a, ...patch }) : a)),
  })
}

export type DeleteResult = 'ok' | 'not-found' | 'has-transactions' | 'last-account'

/**
 * Borra la cuenta y todo lo que colgaba de ella (tarjetas, billeteras).
 *
 * Se niega si tiene movimientos, a diferencia de `deleteCategory`, que sí se
 * lleva los suyos: un movimiento de una cuenta ES un saldo, y borrarlo en
 * silencio movería plata que el usuario cree tener. Que la quite a mano o que
 * la deje ahí; la app no decide eso por él.
 *
 * También se niega con la última cuenta gastable: sin ninguna no habría dónde
 * registrar, y la pantalla de Registrar quedaría sin cuenta que ofrecer.
 */
export function deleteAccount(id: string): DeleteResult {
  const account = getAccount(id)
  if (account === undefined) return 'not-found'
  // El destino de una transferencia también es un movimiento de esa cuenta:
  // sin mirar `toAccountId`, borrar la cuenta que recibió haría desaparecer la
  // otra mitad de la transferencia y el origen quedaría restando contra nada.
  if (data.transactions.some((t) => t.accountId === id || t.toAccountId === id)) {
    return 'has-transactions'
  }
  if (account.kind !== 'credit' && spendableAccounts().length <= 1) return 'last-account'

  const huerfanas = new Set(cardsForAccount(id).map((c) => c.id))
  commit({
    ...data,
    accounts: data.accounts.filter((a) => a.id !== id),
    cards: data.cards.filter((c) => c.accountId !== id),
    wallets: data.wallets.filter((w) => w.accountId !== id).map((w) => dropCard(w, huerfanas)),
  })
  return 'ok'
}

/** La billetera sobrevive a su tarjeta: la cuenta es la verdad, la tarjeta la etiqueta. */
function dropCard(w: Wallet, removed: Set<string>): Wallet {
  if (w.cardId === undefined || !removed.has(w.cardId)) return w
  const limpia = { ...w }
  delete limpia.cardId
  return limpia
}

/** Tarjeta de débito: una llave más para una cuenta que ya existe, sin saldo propio. */
export function addDebitCard(input: {
  name: string
  accountId: string
  brand?: CardBrand
  last4?: string
}): Card | null {
  // Contra una cuenta `cash` no hay plástico, y contra una `credit` la tarjeta
  // no sería de débito: en los dos casos el dato sería incoherente, no incompleto.
  if (getAccount(input.accountId)?.kind !== 'bank') return null
  const card: Card = compact({
    id: crypto.randomUUID(),
    name: input.name.trim(),
    kind: 'debit',
    accountId: input.accountId,
    brand: input.brand,
    last4: cleanLast4(input.last4),
  })
  commit({ ...data, cards: [...data.cards, card] })
  return card
}

/**
 * Tarjeta de crédito: nace con su cuenta `credit`, donde vive la deuda. Los dos
 * objetos se crean juntos y se borran juntos, así que nunca hay una línea sin
 * plástico ni un plástico sin dónde acumular lo que se debe.
 *
 * Arranca pendiente de calibrar, igual que una cuenta: lo que se debe hoy lo
 * dice el usuario, no lo adivina la app.
 */
export function addCreditCard(input: {
  name: string
  issuer?: string
  brand?: CardBrand
  last4?: string
  creditLimitCents?: number
  closingDay?: number
  dueDay?: number
}): Card {
  const name = input.name.trim()
  const account: Account = compact({
    id: crypto.randomUUID(),
    name,
    kind: 'credit' as const,
    balancePending: true as const,
    issuer: input.issuer?.trim() || undefined,
    creditLimitCents: input.creditLimitCents,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
  })
  const card: Card = compact({
    id: crypto.randomUUID(),
    name,
    kind: 'credit' as const,
    accountId: account.id,
    brand: input.brand,
    last4: cleanLast4(input.last4),
  })
  commit({ ...data, accounts: [...data.accounts, account], cards: [...data.cards, card] })
  return card
}

/**
 * Solo la identidad de la tarjeta. Los hechos de plata de una de crédito
 * (línea, cierre, vencimiento) viven en su cuenta y se editan con
 * `updateAccount`: son de la línea, no del plástico.
 */
export function updateCard(id: string, patch: Partial<Omit<Card, 'id' | 'kind' | 'accountId'>>) {
  const limpio = 'last4' in patch ? { ...patch, last4: cleanLast4(patch.last4) } : patch
  commit({
    ...data,
    cards: data.cards.map((c) => (c.id === id ? compact({ ...c, ...limpio }) : c)),
  })
}

/**
 * Borrar una tarjeta de débito es tirar una etiqueta: los movimientos que la
 * nombraban se quedan, sin ella. Borrar una de crédito es borrar su cuenta, así
 * que hereda la regla de `deleteAccount` y se niega si tiene movimientos.
 */
export function deleteCard(id: string): DeleteResult {
  const card = getCard(id)
  if (card === undefined) return 'not-found'
  if (card.kind === 'credit') return deleteAccount(card.accountId)

  const removed = new Set([id])
  commit({
    ...data,
    cards: data.cards.filter((c) => c.id !== id),
    wallets: data.wallets.map((w) => dropCard(w, removed)),
    transactions: data.transactions.map((t) => (t.cardId === id ? sinTarjeta(t) : t)),
  })
  return 'ok'
}

function sinTarjeta(t: Transaction): Transaction {
  const limpio = { ...t }
  delete limpio.cardId
  return limpio
}

/**
 * Yape/Plin con origen. Si viene tarjeta, la cuenta se DERIVA de ella en vez de
 * confiar en las dos: guardadas por separado podrían terminar diciendo cosas
 * distintas sobre de dónde sale la plata.
 */
function resolveWalletSource(
  accountId: string,
  cardId: string | undefined,
): { accountId: string; cardId?: string } | null {
  if (cardId === undefined) {
    return getAccount(accountId)?.kind === 'bank' ? { accountId } : null
  }
  const card = getCard(cardId)
  if (card === undefined || card.kind !== 'debit') return null
  return { accountId: card.accountId, cardId }
}

export function addWallet(input: {
  name: string
  provider: WalletProvider
  accountId: string
  cardId?: string
}): Wallet | null {
  const source = resolveWalletSource(input.accountId, input.cardId)
  if (source === null) return null
  const wallet: Wallet = compact({
    id: crypto.randomUUID(),
    name: input.name.trim(),
    provider: input.provider,
    ...source,
  })
  commit({ ...data, wallets: [...data.wallets, wallet] })
  return wallet
}

export function updateWallet(
  id: string,
  patch: Partial<Omit<Wallet, 'id'>>,
): 'ok' | 'not-found' | 'invalid-source' {
  const previa = data.wallets.find((w) => w.id === id)
  if (previa === undefined) return 'not-found'
  const fundida = { ...previa, ...patch }
  const source = resolveWalletSource(
    fundida.accountId,
    'cardId' in patch ? patch.cardId : previa.cardId,
  )
  if (source === null) return 'invalid-source'
  const wallet: Wallet = compact({
    id: previa.id,
    name: fundida.name.trim(),
    provider: fundida.provider,
    ...source,
  })
  commit({ ...data, wallets: data.wallets.map((w) => (w.id === id ? wallet : w)) })
  return 'ok'
}

export function deleteWallet(id: string) {
  commit({ ...data, wallets: data.wallets.filter((w) => w.id !== id) })
}

/**
 * De dónde sale la plata al elegir Yape (o Plin) en Registrar. Devuelve
 * `undefined` si el usuario no lo declaró: ahí la pantalla deja la cuenta que
 * ya estaba elegida en vez de adivinar por él.
 */
export function walletFor(provider: WalletProvider): Wallet | undefined {
  return data.wallets.find((w) => w.provider === provider)
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
export function setMonthlyBudgetCents(cents: number) {
  commit({ ...data, monthlyBudgetCents: Math.max(0, cents) })
}

/** Cierra la bienvenida. `cents` en 0 = "definirlo después". */
export function completeOnboarding(cents: number) {
  commit({ ...data, monthlyBudgetCents: Math.max(0, cents), onboarded: true })
}

/* ---------- ciclo mensual ---------- */

/**
 * Día en que empieza el mes del usuario (para quien cobra antes de fin de
 * mes). Acotado a 1–28: del 29 al 31 hay meses que no llegan.
 */
export function setMonthStartDay(day: number) {
  commit({ ...data, monthStartDay: Math.min(28, Math.max(1, Math.trunc(day))) })
}

/**
 * El ciclo en el que cae hoy: el "mes actual" de toda la navegación. Con el
 * inicio en 28, el 2 de septiembre estás parado en "Septiembre", que arrancó
 * el 28 de agosto. Con inicio 1 es el mes calendario de siempre.
 */
export function currentMonthKey(): string {
  return monthKeyFor(todayISO(), data.monthStartDay)
}

/* ---------- recordatorios y ocurrencias (ADR 0003) ---------- */

export function addReminder(r: Omit<Reminder, 'id' | 'paidOn' | 'createdOn'> & { createdOn?: string; paidOn?: string[] }): Reminder {
  const reminder: Reminder = {
    ...r,
    id: crypto.randomUUID(),
    paidOn: r.paidOn ?? [],
    // Al restaurar un borrado se conserva la original: si se pusiera hoy, las
    // ocurrencias viejas ya pagadas se perderían y volverían como vencidas.
    createdOn: r.createdOn ?? todayISO(),
  }
  commit({ ...data, reminders: [...data.reminders, reminder] })
  return reminder
}

export function updateReminder(id: string, patch: Partial<Omit<Reminder, 'id'>>) {
  commit({
    ...data,
    reminders: data.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  })
}

/** Devuelve el borrado para poder deshacer, como con las categorías. */
export function deleteReminder(id: string): Reminder | undefined {
  const previo = data.reminders.find((r) => r.id === id)
  commit({ ...data, reminders: data.reminders.filter((r) => r.id !== id) })
  return previo
}

export function getReminder(id: string): Reminder | undefined {
  return data.reminders.find((r) => r.id === id)
}

/**
 * Una vez que toca un recordatorio: qué día, si ya se saldó, y si viene
 * arrastrada de un ciclo anterior.
 */
export interface Occurrence {
  reminder: Reminder
  date: string
  paid: boolean
  /** Venció sin pagarse: se arrastra hasta que se pague (ADR 0003, D2). */
  overdue: boolean
}

function occurrenceIn(reminder: Reminder, from: string, to: string, today: string): Occurrence | null {
  const date =
    reminder.recurrence === 'once'
      ? ((reminder.date ?? '') >= from && (reminder.date ?? '') <= to ? reminder.date! : null)
      : reminder.day === undefined
        ? null
        : monthlyOccurrence(reminder.day, from, to)
  // Nada antes de que el recordatorio existiera: no se le puede reclamar al
  // usuario un recibo de un mes en que la app ni sabía del recordatorio.
  if (date === null || date < reminder.createdOn) return null
  const paid = reminder.paidOn.includes(date)
  return { reminder, date, paid, overdue: !paid && date < today }
}

/** Lo que toca en un ciclo, ordenado por fecha. No incluye lo arrastrado. */
export function occurrencesIn(month: string, today: string = todayISO()): Occurrence[] {
  const { from, to } = cycleRange(month, data.monthStartDay)
  return data.reminders
    .flatMap((r) => {
      const o = occurrenceIn(r, from, to, today)
      return o === null ? [] : [o]
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * Cuántos ciclos hacia atrás se buscan vencidas. Una deuda no desaparece al
 * cambiar de mes (ADR 0003), pero tampoco tiene sentido arrastrar un recibo de
 * hace tres años: a esa altura ya no es un recordatorio olvidado, es basura.
 */
const CICLOS_ATRAS = 12

/**
 * Lo que venció y sigue sin pagarse, de ciclos anteriores al actual. Va aparte
 * de `occurrencesIn` porque no pertenece a este ciclo: se muestra acá porque
 * hay que pagarlo, no porque toque ahora.
 */
export function overdueOccurrences(today: string = todayISO()): Occurrence[] {
  const actual = currentMonthKey()
  const out: Occurrence[] = []
  for (let i = 1; i <= CICLOS_ATRAS; i++) {
    for (const o of occurrencesIn(shiftMonth(actual, -i), today)) {
      if (o.overdue) out.push(o)
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * Marca una ocurrencia como saldada. NO mueve plata: eso lo hace el movimiento
 * real que registra el flujo «Pagar» (ADR 0003, D2). Marcar acá sin registrar
 * el movimiento deja el recordatorio en orden y los saldos intactos, que es
 * exactamente lo que corresponde cuando el usuario pagó por fuera de la app.
 */
export function markOccurrencePaid(reminderId: string, date: string) {
  commit({
    ...data,
    reminders: data.reminders.map((r) =>
      r.id === reminderId && !r.paidOn.includes(date) ? { ...r, paidOn: [...r.paidOn, date] } : r,
    ),
  })
}

export function unmarkOccurrencePaid(reminderId: string, date: string) {
  commit({
    ...data,
    reminders: data.reminders.map((r) =>
      r.id === reminderId ? { ...r, paidOn: r.paidOn.filter((d) => d !== date) } : r,
    ),
  })
}

/* ---------- selectores ---------- */

/**
 * Cómo pesa un movimiento en un ciclo dado. Sin cuotas es todo o nada: pesa
 * entero en su propio ciclo y cero en los demás. Con cuotas se reparte —el
 * presupuesto siente solo la cuota que toca (ADR 0004, D6)— y por eso un mismo
 * movimiento aparece en varios ciclos.
 *
 * El reparto usa el ciclo del USUARIO, no el de la tarjeta: lo que se está
 * repartiendo es el presupuesto, y el presupuesto es mensual del usuario.
 */
export interface MonthEntry {
  tx: Transaction
  /** Lo que pesa en este ciclo. Igual a `tx.amountCents` salvo en cuotas. */
  centsInMonth: number
  /** En qué cuota va, 1..count. Solo en compras en cuotas. */
  installment?: number
  installmentCount?: number
}

function entryFor(t: Transaction, month: string): MonthEntry | null {
  const propio = monthKeyFor(t.date, data.monthStartDay)
  const count = t.installmentCount
  // Las cuotas solo tienen sentido en un gasto: una devolución o un ajuste no
  // se pagan de a partes.
  if (count === undefined || count < 2 || t.nature !== 'expense') {
    return propio === month ? { tx: t, centsInMonth: t.amountCents } : null
  }
  const i = monthsBetween(propio, month)
  if (i < 0 || i >= count) return null
  return {
    tx: t,
    centsInMonth: installmentCents(t.amountCents, count, i),
    installment: i + 1,
    installmentCount: count,
  }
}

/**
 * Todo lo que pesa en un ciclo: los movimientos de ese ciclo y las cuotas de
 * compras anteriores que todavía se están pagando. Sin esto, el total del mes
 * incluiría una cuota que no aparece en ninguna fila y el usuario no tendría
 * de dónde sacar el número.
 */
export function monthEntries(month: string): MonthEntry[] {
  return data.transactions
    .flatMap((t) => {
      const e = entryFor(t, month)
      return e === null ? [] : [e]
    })
    .sort((a, b) => (a.tx.date < b.tx.date ? 1 : -1))
}

export function transactionsByMonth(month: string): Transaction[] {
  // Agrupa por ciclo, no por mes calendario: los demás selectores mensuales
  // (totales, categorías, presupuestos) heredan el ciclo pasando por acá.
  return data.transactions
    .filter((t) => monthKeyFor(t.date, data.monthStartDay) === month)
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
  for (const { tx, centsInMonth } of monthEntries(month)) {
    if (tx.nature === 'income') income += centsInMonth
    else if (tx.nature === 'expense') expense += centsInMonth
    else if (tx.nature === 'refund') expense -= centsInMonth
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
  for (const { tx, centsInMonth } of monthEntries(month)) {
    if (tx.categoryId === undefined) continue
    if (tx.nature === 'expense') map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + centsInMonth)
    else if (tx.nature === 'refund')
      map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) - centsInMonth)
  }
  return [...map.entries()]
    .map(([categoryId, total]) => ({ categoryId, total }))
    .sort((a, b) => b.total - a.total)
}

/** Totales de los últimos `count` ciclos, del más antiguo al más reciente. */
export function lastMonthsTotals(count: number, endMonth: string = currentMonthKey()) {
  const out: { month: string; income: number; expense: number }[] = []
  for (let i = count - 1; i >= 0; i--) {
    const month = shiftMonth(endMonth, -i)
    const { income, expense } = monthTotals(month)
    out.push({ month, income, expense })
  }
  return out
}

/**
 * Avance del tope global del mes: cuánto del presupuesto total ya se gastó.
 * Devuelve null si no hay tope definido, para que la UI simplemente no lo muestre.
 */
export function monthlyBudgetStatus(month: string) {
  const budgetCents = data.monthlyBudgetCents
  if (budgetCents <= 0) return null
  const spentCents = monthTotals(month).expense
  return {
    budgetCents,
    spentCents,
    remainingCents: budgetCents - spentCents,
    pct: spentCents / budgetCents,
    over: spentCents > budgetCents,
  }
}

export type MonthlyBudgetStatus = NonNullable<ReturnType<typeof monthlyBudgetStatus>>

/** Avance de presupuesto del mes, solo para categorías que tengan monto definido. */
export function budgetStatus(month: string) {
  const spent = new Map(expenseByCategory(month).map((e) => [e.categoryId, e.total]))
  return data.categories
    .filter((c) => c.type === 'expense' && typeof c.budgetCents === 'number' && c.budgetCents > 0)
    .map((category) => {
      const budgetCents = category.budgetCents as number
      const spentCents = spent.get(category.id) ?? 0
      return {
        category,
        budgetCents,
        spentCents,
        pct: spentCents / budgetCents,
        over: spentCents > budgetCents,
      }
    })
    .sort((a, b) => b.pct - a.pct)
}
