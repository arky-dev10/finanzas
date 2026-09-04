import { beforeEach, describe, expect, it } from 'vitest'
import { monthKey } from '@/lib/format'
import {
  accountBalanceCents,
  accountDebtCents,
  addAccount,
  addAdjustment,
  addCreditCard,
  addDebitCard,
  addTransaction,
  addWallet,
  budgetStatus,
  creditAvailableCents,
  currentMonthKey,
  deleteAccount,
  deleteCard,
  expenseByCategory,
  getAccount,
  getCard,
  getData,
  monthTotals,
  monthlyBudgetStatus,
  replaceData,
  setMonthStartDay,
  totalDebtCents,
  totalInAccounts,
  transactionsByMonth,
  updateWallet,
  walletFor,
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
    cards: [],
    wallets: [],
    categories: CATEGORIAS,
    transactions: MOVIMIENTOS,
    monthlyBudgetCents: 0,
    monthStartDay: 1,
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

/*
 * El resto de la suite corre entera con `monthStartDay: 1` (lo fija `sembrar`):
 * ESA es la regresión grande — con día 1 nada de lo de siempre cambia. Acá
 * abajo se fija la identidad explícita y lo que pasa con el ciclo corrido.
 */
describe('ciclo mensual configurable', () => {
  it('con día 1 el fin de mes se queda en su mes calendario (regresión)', () => {
    sembrar({
      transactions: [
        { id: 'e31', amountCents: 1000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-31' },
      ],
    })
    expect(monthTotals('2026-08').expense).toBe(1000)
    expect(monthTotals('2026-09').expense).toBe(0)
    // Y el "mes actual" es el mismo mes calendario de siempre.
    expect(currentMonthKey()).toBe(monthKey())
  })

  it('con día 28 los últimos días de agosto pertenecen a septiembre', () => {
    // El caso que motivó todo: gastos del 28-31 de agosto con sueldo del 28.
    sembrar({
      monthStartDay: 28,
      transactions: [
        { id: 'ago', amountCents: 4000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-27' },
        { id: 'sep1', amountCents: 3000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-29' },
        { id: 'sep2', amountCents: 2000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-09-10' },
      ],
    })
    expect(transactionsByMonth('2026-08').map((t) => t.id)).toEqual(['ago'])
    expect(transactionsByMonth('2026-09').map((t) => t.id)).toEqual(['sep2', 'sep1'])
    expect(monthTotals('2026-08').expense).toBe(4000)
    expect(monthTotals('2026-09').expense).toBe(5000)
    expect(expenseByCategory('2026-09')).toEqual([{ categoryId: 'c_food', total: 5000 }])
  })

  it('mide el tope mensual contra el gasto de todo el ciclo', () => {
    sembrar({
      monthStartDay: 28,
      monthlyBudgetCents: 10000,
      transactions: [
        { id: 'a', amountCents: 6000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-29' },
        { id: 'b', amountCents: 3000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-09-10' },
      ],
    })
    const s = monthlyBudgetStatus('2026-09')!
    expect(s.spentCents).toBe(9000)
    expect(s.remainingCents).toBe(1000)
    expect(s.over).toBe(false)
    // En agosto (que terminó el 27) no se gastó nada de este tope.
    expect(monthlyBudgetStatus('2026-08')!.spentCents).toBe(0)
  })

  it('el presupuesto por categoría también mide el ciclo completo', () => {
    sembrar({
      monthStartDay: 28,
      categories: [{ ...CATEGORIAS[0], budgetCents: 5000 }, ...CATEGORIAS.slice(1)],
      transactions: [
        { id: 'a', amountCents: 4000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-30' },
        { id: 'b', amountCents: 2000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-09-05' },
      ],
    })
    const [b] = budgetStatus('2026-09')
    expect(b.spentCents).toBe(6000)
    expect(b.over).toBe(true)
  })

  it('la devolución descuenta en su ciclo aunque cruce el cambio de mes calendario', () => {
    // Gasto el 29-ago, devolución el 2-sep: mismo ciclo "Septiembre", así que
    // el neto del ciclo la absorbe y agosto ni se entera.
    sembrar({
      monthStartDay: 28,
      transactions: [
        { id: 'e', amountCents: 5000, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-29' },
        { id: 'r', amountCents: 2000, nature: 'refund', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-09-02' },
      ],
    })
    expect(monthTotals('2026-09').expense).toBe(3000)
    expect(expenseByCategory('2026-09')).toEqual([{ categoryId: 'c_food', total: 3000 }])
    expect(monthTotals('2026-08').expense).toBe(0)
  })

  it('setMonthStartDay acota el día a 1–28 y a enteros', () => {
    setMonthStartDay(0)
    expect(getData().monthStartDay).toBe(1)
    setMonthStartDay(99)
    expect(getData().monthStartDay).toBe(28)
    setMonthStartDay(15.9)
    expect(getData().monthStartDay).toBe(15)
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

/* ---------- tarjetas, deuda y billeteras (ADR 0004) ---------- */

/** Cuentas ya calibradas: sin `balancePending` los saldos entran a los totales. */
function sembrarCalibradas() {
  sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank' }], transactions: [] })
  addAdjustment('a_bcp', 240000, '2026-08-01')
}

describe('deuda de tarjeta de crédito', () => {
  it('la tarjeta de crédito NO suma a «En cuentas»: sería contar deuda como plata', () => {
    sembrarCalibradas()
    const visa = addCreditCard({ name: 'Visa BCP' })
    addAdjustment(visa.accountId, -125000)

    expect(totalInAccounts()).toEqual({ totalCents: 240000, reliable: true })
    expect(totalDebtCents()).toEqual({ totalCents: 125000, reliable: true })
  })

  it('una tarjeta sin calibrar no ensucia «En cuentas», solo la deuda', () => {
    sembrarCalibradas()
    addCreditCard({ name: 'Amex' })

    // Su saldo es desconocido, no cero — pero el desconocido es de la deuda.
    expect(totalInAccounts()).toEqual({ totalCents: 240000, reliable: true })
    expect(totalDebtCents().reliable).toBe(false)
  })

  it('la deuda se lee en positivo, y un pago de más queda como saldo a favor', () => {
    sembrarCalibradas()
    const visa = addCreditCard({ name: 'Visa BCP' })
    addAdjustment(visa.accountId, -10000)
    expect(accountDebtCents(visa.accountId)).toBe(10000)

    // Pagaste 150 debiendo 100: el saldo a favor existe y no se recorta a cero.
    addTransaction({
      amountCents: 15000,
      nature: 'income',
      accountId: visa.accountId,
      categoryId: 'c_salary',
      date: '2026-08-10',
    })
    expect(accountDebtCents(visa.accountId)).toBe(-5000)
  })

  it('el disponible de línea es lo que queda del crédito del banco, no plata del usuario', () => {
    sembrarCalibradas()
    const visa = addCreditCard({ name: 'Visa BCP', creditLimitCents: 600000 })
    addAdjustment(visa.accountId, -125000)

    expect(creditAvailableCents(visa.accountId)).toBe(475000)
    // Y en ningún caso se filtró al dinero del usuario.
    expect(totalInAccounts().totalCents).toBe(240000)
  })

  it('sin línea cargada no inventa un disponible', () => {
    sembrarCalibradas()
    const visa = addCreditCard({ name: 'Visa BCP' })
    expect(creditAvailableCents(visa.accountId)).toBeNull()
    expect(creditAvailableCents('a_bcp')).toBeNull()
  })
})

describe('crear y borrar cuentas', () => {
  it('una cuenta nueva nace pendiente de calibrar, no en cero', () => {
    sembrarCalibradas()
    const interbank = addAccount({ name: 'Interbank', kind: 'bank', issuer: 'Interbank' })

    expect(getAccount(interbank.id)?.balancePending).toBe(true)
    expect(totalInAccounts()).toEqual({ totalCents: 240000, reliable: false })
  })

  it('se niega a borrar una cuenta con movimientos: eso movería un saldo real', () => {
    expect(deleteAccount('a_bcp')).toBe('has-transactions')
    expect(getAccount('a_bcp')).toBeDefined()
  })

  it('se niega a borrar la última cuenta gastable: no quedaría dónde registrar', () => {
    sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank' }], transactions: [] })
    expect(deleteAccount('a_bcp')).toBe('last-account')
  })

  it('la tarjeta de crédito no cuenta como cuenta gastable para esa regla', () => {
    sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank' }], transactions: [] })
    const visa = addCreditCard({ name: 'Visa BCP' })
    // Borrarla deja al usuario sin tarjetas pero con su cuenta: es válido.
    expect(deleteAccount(visa.accountId)).toBe('ok')
    expect(deleteAccount('a_bcp')).toBe('last-account')
  })

  it('al borrar la cuenta se lleva sus tarjetas y billeteras', () => {
    sembrar({ accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank' }], transactions: [] })
    const otra = addAccount({ name: 'Interbank', kind: 'bank' })
    const debito = addDebitCard({ name: 'Visa Débito', accountId: otra.id })!
    addWallet({ name: 'Yape', provider: 'yape', accountId: otra.id, cardId: debito.id })

    expect(deleteAccount(otra.id)).toBe('ok')
    expect(getData().cards).toHaveLength(0)
    expect(getData().wallets).toHaveLength(0)
  })
})

describe('tarjetas', () => {
  it('la de débito solo cuelga de una cuenta bancaria', () => {
    sembrar({ transactions: [] })
    expect(addDebitCard({ name: 'Débito', accountId: 'a_cash' })).toBeNull()
    expect(addDebitCard({ name: 'Débito', accountId: 'no-existe' })).toBeNull()
    expect(addDebitCard({ name: 'Visa Débito', accountId: 'a_bcp' })).not.toBeNull()
  })

  it('la de crédito nace junto a su cuenta de deuda, y se borran juntas', () => {
    sembrar({ transactions: [] })
    const visa = addCreditCard({ name: 'Visa BCP', closingDay: 5, dueDay: 22 })

    const cuenta = getAccount(visa.accountId)
    expect(cuenta?.kind).toBe('credit')
    expect(cuenta?.closingDay).toBe(5)
    expect(cuenta?.dueDay).toBe(22)

    expect(deleteCard(visa.id)).toBe('ok')
    expect(getAccount(visa.accountId)).toBeUndefined()
  })

  it('borrar la de crédito hereda la regla de la cuenta: no se va con movimientos encima', () => {
    sembrar({ transactions: [] })
    const visa = addCreditCard({ name: 'Visa BCP' })
    addTransaction({
      amountCents: 30000,
      nature: 'expense',
      accountId: visa.accountId,
      categoryId: 'c_food',
      date: '2026-08-03',
    })
    expect(deleteCard(visa.id)).toBe('has-transactions')
    expect(getCard(visa.id)).toBeDefined()
  })

  it('borrar la de débito tira la etiqueta, nunca el movimiento', () => {
    sembrar({ transactions: [] })
    const debito = addDebitCard({ name: 'Visa Débito', accountId: 'a_bcp' })!
    addTransaction({
      amountCents: 4000,
      nature: 'expense',
      accountId: 'a_bcp',
      categoryId: 'c_food',
      cardId: debito.id,
      date: '2026-08-03',
    })

    expect(deleteCard(debito.id)).toBe('ok')
    const [tx] = getData().transactions
    expect(tx.amountCents).toBe(4000)
    expect(tx.cardId).toBeUndefined()
  })

  it('guarda solo los últimos cuatro dígitos y descarta lo que no lo sea', () => {
    sembrar({ transactions: [] })
    expect(addDebitCard({ name: 'A', accountId: 'a_bcp', last4: '4111 1111 1111 4821' })?.last4).toBe('4821')
    expect(addDebitCard({ name: 'B', accountId: 'a_bcp', last4: '12' })?.last4).toBeUndefined()
  })
})

describe('billeteras Yape / Plin', () => {
  it('la cuenta se deriva de la tarjeta: no pueden decir cosas distintas', () => {
    sembrar({ transactions: [] })
    const otra = addAccount({ name: 'Interbank', kind: 'bank' })
    const debito = addDebitCard({ name: 'Débito Interbank', accountId: otra.id })!

    // Le pasamos una cuenta que NO es la de la tarjeta: manda la tarjeta.
    const yape = addWallet({ name: 'Yape', provider: 'yape', accountId: 'a_bcp', cardId: debito.id })
    expect(yape?.accountId).toBe(otra.id)
  })

  it('funciona sin tarjeta: para tener Yape no hace falta registrar un plástico', () => {
    sembrar({ transactions: [] })
    const yape = addWallet({ name: 'Yape', provider: 'yape', accountId: 'a_bcp' })
    expect(yape?.accountId).toBe('a_bcp')
    expect(yape?.cardId).toBeUndefined()
  })

  it('rechaza orígenes que no son una cuenta bancaria', () => {
    sembrar({ transactions: [] })
    const visa = addCreditCard({ name: 'Visa BCP' })
    expect(addWallet({ name: 'Yape', provider: 'yape', accountId: 'a_cash' })).toBeNull()
    expect(addWallet({ name: 'Yape', provider: 'yape', accountId: visa.accountId })).toBeNull()
    expect(addWallet({ name: 'Yape', provider: 'yape', accountId: 'a_bcp', cardId: visa.id })).toBeNull()
  })

  it('al mover la billetera de tarjeta, la cuenta la sigue', () => {
    sembrar({ transactions: [] })
    const otra = addAccount({ name: 'Interbank', kind: 'bank' })
    const deOtra = addDebitCard({ name: 'Débito Interbank', accountId: otra.id })!
    const yape = addWallet({ name: 'Yape', provider: 'yape', accountId: 'a_bcp' })!

    expect(updateWallet(yape.id, { cardId: deOtra.id })).toBe('ok')
    expect(walletFor('yape')?.accountId).toBe(otra.id)
  })

  it('walletFor no adivina cuando el usuario no declaró su Yape', () => {
    sembrar({ transactions: [] })
    expect(walletFor('yape')).toBeUndefined()
  })
})
