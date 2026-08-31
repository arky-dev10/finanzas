import { beforeEach, describe, expect, it } from 'vitest'
import {
  accountBalanceCents,
  addAdjustment,
  addTransaction,
  budgetStatus,
  expenseByCategory,
  getAccount,
  monthTotals,
  monthlyBudgetStatus,
  replaceData,
  totalInAccounts,
  transactionsByMonth,
} from '@/lib/store'
import type { Account, Category, Transaction } from '@/types'

const CUENTAS: Account[] = [
  { id: 'a_bcp', name: 'BCP', kind: 'bank' },
  { id: 'a_cash', name: 'Efectivo', kind: 'cash' },
]

const CATEGORIAS: Category[] = [
  { id: 'c_food', name: 'Comida', icon: 'utensils', color: '#eb6834', type: 'expense' },
  { id: 'c_fun', name: 'Ocio', icon: 'gamepad-2', color: '#e87ba4', type: 'expense' },
  { id: 'c_salary', name: 'Salario', icon: 'wallet', color: '#008300', type: 'income' },
]

/** Un mes de agosto con las cuatro naturalezas, montos elegidos a mano. */
const MOVIMIENTOS: Transaction[] = [
  { id: 'i1', amountCents: 300000, nature: 'income', accountId: 'a_bcp', categoryId: 'c_salary', date: '2026-08-01' },
  { id: 'e1', amountCents: 5000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-05' },
  { id: 'e2', amountCents: 3000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-06' },
  { id: 'r1', amountCents: 2000, nature: 'refund', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-20' },
  { id: 'aj', amountCents: 1000, nature: 'adjustment', accountId: 'a_cash', date: '2026-08-02' },
]

function sembrar(patch: Partial<Parameters<typeof replaceData>[0]> = {}) {
  replaceData({
    accounts: CUENTAS,
    categories: CATEGORIAS,
    transactions: MOVIMIENTOS,
    monthlyBudgetCents: 0,
    onboarded: true,
    ...patch,
  })
}

beforeEach(() => sembrar())

describe('monthTotals', () => {
  it('descuenta la devolución del gasto del mes', () => {
    // 5000 + 3000 de gasto − 2000 de devolución
    expect(monthTotals('2026-08').expense).toBe(6000)
  })

  it('no cuenta la devolución como ingreso', () => {
    expect(monthTotals('2026-08').income).toBe(300000)
  })

  it('deja el ajuste fuera de los totales', () => {
    // El ajuste de +1000 en Efectivo no aparece ni en ingresos ni en gastos.
    expect(monthTotals('2026-08').balance).toBe(294000)
  })

  it('devuelve ceros en un mes sin movimientos', () => {
    expect(monthTotals('2026-01')).toEqual({ income: 0, expense: 0, balance: 0 })
  })
})

describe('expenseByCategory', () => {
  it('descuenta las devoluciones de su categoría', () => {
    expect(expenseByCategory('2026-08')).toEqual([{ categoryId: 'c_food', total: 6000 }])
  })

  it('deja la categoría en negativo si la devolución supera al gasto del mes', () => {
    sembrar({
      transactions: [
        { id: 'r', amountCents: 2500, nature: 'refund', accountId: 'a_bcp', categoryId: 'c_fun', date: '2026-08-20' },
      ],
    })
    // Honesto a propósito: la UI decide si un gasto neto negativo se grafica.
    expect(expenseByCategory('2026-08')).toEqual([{ categoryId: 'c_fun', total: -2500 }])
  })

  it('ordena de mayor a menor gasto neto', () => {
    sembrar({
      transactions: [
        ...MOVIMIENTOS,
        { id: 'e3', amountCents: 9000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_fun', date: '2026-08-07' },
      ],
    })
    expect(expenseByCategory('2026-08').map((e) => e.categoryId)).toEqual(['c_fun', 'c_food'])
  })
})

describe('la devolución pega en el mes en que ocurre', () => {
  it('no reescribe el mes del gasto original', () => {
    sembrar({
      transactions: [
        { id: 'e', amountCents: 5000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-07-15' },
        { id: 'r', amountCents: 2000, nature: 'refund', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-03' },
      ],
    })
    expect(monthTotals('2026-07').expense).toBe(5000)
    expect(monthTotals('2026-08').expense).toBe(-2000)
  })
})

describe('el ajuste es un movimiento real', () => {
  it('se lista en el historial aunque no cuente para los totales', () => {
    expect(transactionsByMonth('2026-08').map((t) => t.id)).toContain('aj')
  })
})

describe('accountBalanceCents', () => {
  it('suma ingresos y devoluciones y resta gastos', () => {
    // 300000 − 5000 − 3000 + 2000
    expect(accountBalanceCents('a_bcp')).toBe(294000)
  })

  it('suma el delta del ajuste', () => {
    expect(accountBalanceCents('a_cash')).toBe(1000)
  })

  it('suma todos los meses, no solo el actual', () => {
    sembrar({
      transactions: [
        { id: 'a', amountCents: 10000, nature: 'income', accountId: 'a_bcp', categoryId: 'c_salary', date: '2025-01-01' },
        { id: 'b', amountCents: 4000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-01' },
      ],
    })
    expect(accountBalanceCents('a_bcp')).toBe(6000)
  })

  it('devuelve 0 para una cuenta que no existe', () => {
    expect(accountBalanceCents('a_nope')).toBe(0)
  })
})

describe('totalInAccounts', () => {
  it('suma los saldos de todas las cuentas calibradas', () => {
    // 294000 en BCP + 1000 en Efectivo
    expect(totalInAccounts()).toEqual({ totalCents: 295000, reliable: true })
  })

  it('deja fuera de la suma a la cuenta con saldo pendiente', () => {
    // Su saldo es DESCONOCIDO, no cero: sumarla mete sus gastos sin su saldo
    // inicial y el total sale menor que la única cuenta que sí sabemos.
    sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank', balancePending: true }, CUENTAS[1]] })
    expect(totalInAccounts()).toEqual({ totalCents: 1000, reliable: false })
  })

  it('suma la cuenta completa apenas se la calibra', () => {
    sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank', balancePending: true }, CUENTAS[1]] })
    addAdjustment('a_bcp', 500000, '2026-08-25')
    expect(totalInAccounts()).toEqual({ totalCents: 501000, reliable: true })
  })

  it('sigue sin ser confiable si falta calibrar el efectivo', () => {
    // Calibrar solo el banco no alcanza: la billetera sigue siendo desconocida
    // y presentar el total como exacto sería mentir.
    sembrar({
      accounts: [
        { id: 'a_bcp', name: 'BCP', kind: 'bank', balancePending: true },
        { id: 'a_cash', name: 'Efectivo', kind: 'cash', balancePending: true },
      ],
    })
    addAdjustment('a_bcp', 300000, '2026-08-25')
    expect(totalInAccounts()).toEqual({ totalCents: 300000, reliable: false })
  })

  it('da 0 no confiable si ninguna cuenta está calibrada', () => {
    // Es el estado justo después de migrar: BCP arrastra todo el historial
    // pero todavía no sabemos cuánta plata hay ahí de verdad.
    sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank', balancePending: true }] })
    expect(totalInAccounts()).toEqual({ totalCents: 0, reliable: false })
  })
})

describe('addAdjustment', () => {
  it('calibra el saldo contra la realidad con el delta que falta', () => {
    addAdjustment('a_bcp', 300000, '2026-08-25')
    // Estaba en 294000: hace falta un ajuste de +6000.
    expect(accountBalanceCents('a_bcp')).toBe(300000)
    const aj = transactionsByMonth('2026-08').find((t) => t.nature === 'adjustment' && t.accountId === 'a_bcp')!
    expect(aj.amountCents).toBe(6000)
    expect(aj.categoryId).toBeUndefined()
  })

  it('usa un delta negativo cuando sobra plata anotada', () => {
    addAdjustment('a_bcp', 290000, '2026-08-25')
    expect(accountBalanceCents('a_bcp')).toBe(290000)
  })

  it('limpia el saldo pendiente de la cuenta', () => {
    sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank', balancePending: true }, CUENTAS[1]] })
    addAdjustment('a_bcp', 300000, '2026-08-25')
    expect(getAccount('a_bcp')!.balancePending).toBeUndefined()
    expect(totalInAccounts().reliable).toBe(true)
  })

  it('no anota un ajuste de cero, pero igual da el saldo por confiable', () => {
    sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank', balancePending: true }, CUENTAS[1]] })
    addAdjustment('a_bcp', 294000, '2026-08-25')
    expect(transactionsByMonth('2026-08').filter((t) => t.nature === 'adjustment')).toHaveLength(1)
    expect(getAccount('a_bcp')!.balancePending).toBeUndefined()
  })

  it('no anota nada contra una cuenta que no existe', () => {
    // Sería un movimiento huérfano: no lo ve ningún saldo, pero se lista.
    addAdjustment('a_nope', 50000, '2026-08-25')
    expect(transactionsByMonth('2026-08').filter((t) => t.nature === 'adjustment')).toHaveLength(1)
  })

  it('no toca el gasto ni el ingreso del mes', () => {
    addAdjustment('a_bcp', 999999, '2026-08-25')
    expect(monthTotals('2026-08')).toEqual({ income: 300000, expense: 6000, balance: 294000 })
  })
})

describe('el medio se recuerda por cuenta', () => {
  it('guarda el último medio usado en la cuenta', () => {
    addTransaction({ amountCents: 1500, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', medium: 'yape', date: '2026-08-11' })
    expect(getAccount('a_bcp')!.lastMedium).toBe('yape')
  })

  it('ignora el medio en una cuenta de efectivo', () => {
    addTransaction({ amountCents: 1500, nature: 'expense', accountId: 'a_cash', categoryId: 'c_food', medium: 'yape', date: '2026-08-11' })
    const tx = transactionsByMonth('2026-08').find((t) => t.amountCents === 1500)!
    expect(tx.medium).toBeUndefined()
    expect(getAccount('a_cash')!.lastMedium).toBeUndefined()
  })
})

describe('presupuestos, en céntimos', () => {
  it('mide el tope mensual contra el gasto neto', () => {
    sembrar({ monthlyBudgetCents: 10000 })
    const s = monthlyBudgetStatus('2026-08')!
    expect(s.spentCents).toBe(6000)
    expect(s.remainingCents).toBe(4000)
    expect(s.over).toBe(false)
  })

  it('no muestra tope si el usuario no eligió uno', () => {
    expect(monthlyBudgetStatus('2026-08')).toBe(null)
  })

  it('mide el presupuesto por categoría contra el gasto neto', () => {
    sembrar({ categories: [{ ...CATEGORIAS[0], budgetCents: 5000 }, ...CATEGORIAS.slice(1)] })
    const [b] = budgetStatus('2026-08')
    expect(b.spentCents).toBe(6000)
    expect(b.over).toBe(true)
  })
})
