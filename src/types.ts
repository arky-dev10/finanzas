/** Dónde vive la plata. Yape y Plin NO son cuentas: son medios (ver ADR 0001). */
export type AccountKind = 'bank' | 'cash'

/** Por dónde se movió la plata. Set cerrado, sin medios personalizados. */
export type Medium = 'yape' | 'plin' | 'card' | 'transfer' | 'other'

/**
 * Qué significa el movimiento, que no es lo mismo que su dirección:
 * "todo dinero recibido es una entrada, pero no toda entrada es un ingreso".
 */
export type TxNature = 'expense' | 'income' | 'refund' | 'adjustment'

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
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: CategoryKind
  /** Presupuesto mensual en céntimos (solo tiene sentido en categorías de gasto) */
  budget?: number
}

export interface Transaction {
  id: string
  /** Céntimos enteros. Siempre > 0 salvo en `adjustment`, que lleva un delta con signo. */
  amountCents: number
  nature: TxNature
  accountId: string
  /** Requerido salvo en `adjustment`, que no pertenece a ninguna categoría. */
  categoryId?: string
  /** Nunca en cuentas `cash`: el efectivo no se mueve por un canal. */
  medium?: Medium
  date: string
  note?: string
}
