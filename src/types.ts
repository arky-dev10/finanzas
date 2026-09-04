/**
 * Dónde vive la plata (ver ADR 0001 y 0004). Yape y Plin NO son cuentas: son
 * medios. `credit` es la excepción a "vive la plata": guarda deuda, no dinero
 * del usuario, y por eso nunca suma a «En cuentas».
 */
export type AccountKind = 'bank' | 'cash' | 'credit'

/** Por dónde se movió la plata. Set cerrado, sin medios personalizados. */
export type Medium = 'yape' | 'plin' | 'card' | 'transfer' | 'other'

/**
 * Qué significa el movimiento, que no es lo mismo que su dirección:
 * "todo dinero recibido es una entrada, pero no toda entrada es un ingreso".
 *
 * `transfer` es el único que toca DOS cuentas: sale de una y entra a otra, sin
 * ser gasto ni ingreso. Es lo que son el retiro de cajero, el pase entre bancos
 * y el pago de una tarjeta de crédito (ADR 0004, D7).
 */
export type TxNature = 'expense' | 'income' | 'refund' | 'adjustment' | 'transfer'

/** Las categorías siguen partidas en gasto/ingreso: una devolución usa las de gasto. */
export type CategoryKind = 'expense' | 'income'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  /** Sin ajuste inicial el saldo no es confiable y no se presenta como tal. */
  balancePending?: true
  /** Medio recordado de la última vez, para no re-elegirlo cada vez. */
  lastMedium?: Medium
  /** Emisor peruano ("BCP", "Interbank"…). Catálogo abierto: se puede escribir otro. */
  issuer?: string
  /** Solo en `credit`: la línea aprobada, en céntimos. */
  creditLimitCents?: number
  /**
   * Solo en `credit`: día del mes en que cierra el estado de cuenta.
   *
   * Acepta 1–31, a diferencia de `monthStartDay` (1–28): este dato lo fija el
   * banco, hay tarjetas que cierran el 30, y redondearlo a 28 metería un error
   * de días en el número más importante de la pantalla. El día se acota al
   * último del mes al CALCULAR el ciclo, no al guardarlo.
   */
  closingDay?: number
  /** Solo en `credit`: día del mes en que vence el pago (1–31, como `closingDay`). */
  dueDay?: number
}

export type CardKind = 'debit' | 'credit'

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'diners'

/**
 * Llave para llegar a una cuenta, no un lugar donde vive la plata (ADR 0004,
 * D1). La de débito abre una cuenta `bank` que ya existe y no tiene saldo
 * propio; la de crédito abre su cuenta `credit`, que es donde vive la deuda.
 *
 * La cuenta guarda los hechos de plata (saldo, línea, ciclo) y la tarjeta los
 * de identidad (marca, últimos 4, nombre): así una tarjeta adicional sobre la
 * misma línea es representable sin tocar el modelo.
 */
export interface Card {
  id: string
  name: string
  kind: CardKind
  /** Débito → una cuenta `bank`. Crédito → su cuenta `credit`, 1:1 al crearla. */
  accountId: string
  brand?: CardBrand
  /** Últimos cuatro dígitos, solo para reconocerla. Nunca el número completo. */
  last4?: string
}

export type WalletProvider = 'yape' | 'plin'

/**
 * Yape o Plin con origen declarado (ADR 0004, D9): al elegirlo en Registrar,
 * Kumi ya sabe de qué cuenta sale la plata en vez de adivinar.
 *
 * `accountId` es la verdad —de dónde sale y entra la plata— y `cardId` solo la
 * etiqueta con la que el usuario lo reconoce. Guardar únicamente la tarjeta
 * obligaría a registrar un plástico para poder tener Yape, que financieramente
 * no hace falta.
 */
export interface Wallet {
  id: string
  name: string
  provider: WalletProvider
  accountId: string
  /** La tarjeta de débito con la que el usuario lo identifica, si la dijo. */
  cardId?: string
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: CategoryKind
  /** Presupuesto mensual en céntimos (solo tiene sentido en categorías de gasto) */
  budgetCents?: number
}

export interface Transaction {
  id: string
  /** Céntimos enteros. Siempre > 0 salvo en `adjustment`, que lleva un delta con signo. */
  amountCents: number
  nature: TxNature
  /** De dónde sale. En una transferencia, la cuenta de origen. */
  accountId: string
  /**
   * Solo en `transfer`: la cuenta que recibe. Nunca igual a `accountId` —
   * mover plata a la misma cuenta no es nada.
   */
  toAccountId?: string
  /** Requerido salvo en `adjustment` y `transfer`, que no tienen categoría. */
  categoryId?: string
  /** Nunca en cuentas `cash`: el efectivo no se mueve por un canal. */
  medium?: Medium
  /** Con qué tarjeta se hizo, cuando el usuario lo precisa. */
  cardId?: string
  date: string
  note?: string
}
