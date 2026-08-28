export type TxType = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: TxType
  /** Presupuesto mensual opcional (solo tiene sentido en categorías de gasto) */
  budget?: number
}

export interface Transaction {
  id: string
  amount: number
  categoryId: string
  type: TxType
  date: string
  note?: string
}
