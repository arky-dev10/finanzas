import { describe, expect, it } from 'vitest'
import { BACKUP_VERSION, backupFilename, parseData, serialize, toBackup } from '@/lib/backup'

/** Respaldo tal como lo exportaba la app antes de las cuentas: soles y `type`. */
const v2 = {
  version: 2,
  exportedAt: '2026-08-01T00:00:00.000Z',
  monthlyBudget: 3500,
  categories: [
    { id: 'c_food', name: 'Comida', icon: 'utensils', color: '#eb6834', type: 'expense', budget: 500 },
    { id: 'c_salary', name: 'Salario', icon: 'wallet', color: '#008300', type: 'income' },
  ],
  transactions: [
    { id: 't1', amount: 12.5, categoryId: 'c_food', type: 'expense', date: '2026-08-10' },
    { id: 't2', amount: 3000, categoryId: 'c_salary', type: 'income', date: '2026-08-01', note: 'sueldo' },
  ],
}

describe('parseData — migración de respaldos viejos', () => {
  it('pasa los montos de soles a céntimos', () => {
    const d = parseData(v2)!
    expect(d.transactions.map((t) => t.amountCents)).toEqual([1250, 300000])
  })

  it('traduce `type` a naturaleza', () => {
    const d = parseData(v2)!
    expect(d.transactions.map((t) => t.nature)).toEqual(['expense', 'income'])
  })

  it('manda todo el historial pre-cuentas a BCP', () => {
    const d = parseData(v2)!
    expect(d.transactions.every((t) => t.accountId === 'a_bcp')).toBe(true)
  })

  it('siembra las dos cuentas con el saldo pendiente de calibrar', () => {
    // Ninguna de las dos se conoce todavía: el saldo derivado de BCP es la
    // resta de años de movimientos, y la plata de la billetera no la vio nadie.
    const d = parseData(v2)!
    expect(d.accounts).toEqual([
      { id: 'a_bcp', name: 'BCP', kind: 'bank', balancePending: true },
      { id: 'a_cash', name: 'Efectivo', kind: 'cash', balancePending: true },
    ])
  })

  it('pasa el tope mensual y los presupuestos por categoría a céntimos', () => {
    const d = parseData(v2)!
    expect(d.monthlyBudgetCents).toBe(350000)
    expect(d.categories.find((c) => c.id === 'c_food')!.budgetCents).toBe(50000)
  })

  it('conserva nota y fecha', () => {
    const t2 = parseData(v2)!.transactions.find((t) => t.id === 't2')!
    expect(t2.note).toBe('sueldo')
    expect(t2.date).toBe('2026-08-01')
  })

  it('importa respaldos v1, que no traían tope mensual', () => {
    const { monthlyBudget: _mb, version: _v, ...v1 } = v2
    const d = parseData({ ...v1, version: 1 })!
    expect(d.monthlyBudgetCents).toBe(0)
    expect(d.transactions).toHaveLength(2)
  })

  it('migra también el localStorage viejo, que no tiene campo `version`', () => {
    const { version: _v, exportedAt: _e, ...crudo } = v2
    const d = parseData({ ...crudo, onboarded: true })!
    expect(d.transactions[0].amountCents).toBe(1250)
    expect(d.monthlyBudgetCents).toBe(350000)
  })
})

describe('parseData — datos ya migrados', () => {
  it('no vuelve a multiplicar por 100 al releer lo que acaba de guardar', () => {
    const migrado = parseData(v2)!
    const releido = parseData(JSON.parse(serialize(migrado)))!
    expect(releido.transactions.map((t) => t.amountCents)).toEqual([1250, 300000])
    expect(releido.monthlyBudgetCents).toBe(350000)
    expect(releido.accounts).toEqual(migrado.accounts)
  })

  it('no migra un v3 al que se le perdió el `version`', () => {
    const migrado = parseData(v2)!
    const { version: _v, ...sinVersion } = toBackup(migrado)
    expect(parseData(sinVersion)!.transactions[0].amountCents).toBe(1250)
  })

  it('conserva cuentas, medio y ajustes de un respaldo v3', () => {
    const d = parseData({
      version: 3,
      monthlyBudget: 0,
      accounts: [
        { id: 'a_cash', name: 'Efectivo', kind: 'cash' },
        { id: 'a_bcp', name: 'BCP', kind: 'bank', lastMedium: 'yape' },
      ],
      categories: [],
      transactions: [
        { id: 't1', amountCents: -500, nature: 'adjustment', accountId: 'a_cash', date: '2026-08-01' },
        { id: 't2', amountCents: 900, nature: 'refund', accountId: 'a_bcp', categoryId: 'c_food', medium: 'yape', date: '2026-08-02' },
      ],
    })!
    expect(d.accounts).toHaveLength(2)
    expect(d.transactions[0].amountCents).toBe(-500)
    expect(d.transactions[1].medium).toBe('yape')
  })
})

describe('parseData — respaldos v3, que usaban los nombres sin sufijo', () => {
  const v3 = {
    version: 3,
    monthlyBudget: 350000,
    accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank' }],
    categories: [
      { id: 'c_food', name: 'Comida', icon: 'utensils', color: '#eb6834', type: 'expense', budget: 50000 },
    ],
    transactions: [
      { id: 't1', amountCents: 1250, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-10' },
    ],
  }

  it('lee los montos donde estaban, sin volver a multiplicar por 100', () => {
    // v3 ya guardaba céntimos: solo cambió el nombre del campo.
    const d = parseData(v3)!
    expect(d.monthlyBudgetCents).toBe(350000)
    expect(d.categories[0].budgetCents).toBe(50000)
  })

  it('no deja el nombre viejo colgando en los datos migrados', () => {
    const d = parseData(v3)!
    expect('budget' in d.categories[0]).toBe(false)
  })
})

describe('parseData — estados que el modelo declara imposibles', () => {
  const conCuentas = (transactions: unknown[]) => ({
    version: 3,
    accounts: [
      { id: 'a_bcp', name: 'BCP', kind: 'bank' },
      { id: 'a_cash', name: 'Efectivo', kind: 'cash' },
    ],
    categories: [],
    transactions,
  })

  it('saca el medio de un movimiento en efectivo', () => {
    // La plata en mano no se mueve por un canal (CONTEXT.md, "Medio").
    const d = parseData(conCuentas([
      { id: 't1', amountCents: 900, nature: 'expense', accountId: 'a_cash', categoryId: 'c_food', medium: 'yape', date: '2026-08-02' },
    ]))!
    expect(d.transactions[0].medium).toBeUndefined()
  })

  it('deja el medio en una cuenta de banco', () => {
    const d = parseData(conCuentas([
      { id: 't1', amountCents: 900, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', medium: 'yape', date: '2026-08-02' },
    ]))!
    expect(d.transactions[0].medium).toBe('yape')
  })

  it('saca la categoría de un ajuste', () => {
    // Con categoría, borrar esa categoría se llevaría el ajuste puesto y el
    // saldo de la cuenta se movería solo (ver `deleteCategory`).
    const d = parseData(conCuentas([
      { id: 't1', amountCents: 500, nature: 'adjustment', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-08-01' },
    ]))!
    expect(d.transactions[0].categoryId).toBeUndefined()
  })
})

describe('parseData — día de inicio del ciclo', () => {
  const conInicio = (monthStartDay: unknown) => ({
    version: 4,
    monthStartDay,
    accounts: [],
    categories: [],
    transactions: [],
  })

  it('un respaldo sin el campo queda en mes calendario', () => {
    // Todos los respaldos anteriores al ciclo configurable entran por acá.
    expect(parseData(v2)!.monthStartDay).toBe(1)
  })

  it('conserva el día elegido y sobrevive al viaje de ida y vuelta', () => {
    const d = parseData(conInicio(28))!
    expect(d.monthStartDay).toBe(28)
    expect(parseData(JSON.parse(serialize(d)))!.monthStartDay).toBe(28)
  })

  it('normaliza a mes calendario un valor que el modelo no admite', () => {
    // Config, no plata: no amerita tirar el respaldo entero (mismo criterio
    // que un tope mensual inválido, que cae a 0).
    for (const raw of [0, 29, 3.5, '28', null, true]) {
      expect(parseData(conInicio(raw))!.monthStartDay).toBe(1)
    }
  })
})

describe('parseData — datos inválidos', () => {
  it('rechaza basura en vez de romper la app al arrancar', () => {
    expect(parseData(null)).toBe(null)
    expect(parseData('{}')).toBe(null)
    expect(parseData({})).toBe(null)
    expect(parseData({ categories: [], transactions: [{ id: 1 }] })).toBe(null)
  })

  it('rechaza cuentas corruptas en vez de reemplazarlas por las semillas', () => {
    // Sembrar por encima perdería las cuentas reales del usuario y dejaría
    // todos sus movimientos apuntando a cuentas que ya no existen.
    expect(
      parseData({
        version: 3,
        accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'cripto' }],
        categories: [],
        transactions: [],
      }),
    ).toBe(null)
  })

  it('siembra cuentas si el respaldo no trae ninguna', () => {
    const d = parseData({ version: 3, accounts: [], categories: [], transactions: [] })!
    expect(d.accounts.map((a) => a.id)).toEqual(['a_bcp', 'a_cash'])
  })

  it('rechaza un movimiento que no es ajuste y no tiene categoría', () => {
    expect(
      parseData({
        version: 3,
        categories: [],
        transactions: [{ id: 't1', amountCents: 100, nature: 'expense', accountId: 'a_bcp', date: '2026-08-01' }],
      }),
    ).toBe(null)
  })
})

describe('respaldo exportado', () => {
  it('sale en la versión actual y con las cuentas', () => {
    const b = toBackup(parseData(v2)!)
    expect(b.version).toBe(BACKUP_VERSION)
    expect(BACKUP_VERSION).toBe(5)
    expect(b.monthlyBudgetCents).toBe(350000)
    expect(b.accounts).toHaveLength(2)
  })

  it('se llama por la marca, no por el nombre viejo del repo', () => {
    expect(backupFilename(new Date(2026, 7, 31))).toBe('kumi-2026-08-31.json')
  })
})

/* ---------- v5: tarjetas, billeteras y cuentas de crédito (ADR 0004) ---------- */

/** Respaldo v5 completo, con los tres objetos nuevos apuntándose entre sí. */
const v5 = {
  version: 5,
  exportedAt: '2026-09-04T00:00:00.000Z',
  monthlyBudgetCents: 0,
  monthStartDay: 1,
  accounts: [
    { id: 'a_bcp', name: 'BCP', kind: 'bank', issuer: 'BCP' },
    {
      id: 'a_visa',
      name: 'Visa BCP',
      kind: 'credit',
      issuer: 'BCP',
      creditLimitCents: 600000,
      closingDay: 30,
      dueDay: 22,
    },
  ],
  cards: [
    { id: 'k_deb', name: 'Visa Débito', kind: 'debit', accountId: 'a_bcp', brand: 'visa', last4: '4821' },
    { id: 'k_cred', name: 'Visa BCP', kind: 'credit', accountId: 'a_visa', brand: 'visa' },
  ],
  wallets: [{ id: 'w_yape', name: 'Yape', provider: 'yape', accountId: 'a_bcp', cardId: 'k_deb' }],
  categories: [{ id: 'c_food', name: 'Comida', icon: 'utensils', color: '#eb6834', type: 'expense' }],
  transactions: [
    { id: 't1', amountCents: 30000, nature: 'expense', accountId: 'a_visa', categoryId: 'c_food', date: '2026-09-03', cardId: 'k_cred' },
  ],
}

describe('parseData — v5', () => {
  it('conserva la cuenta de crédito con su línea y su ciclo', () => {
    const a = parseData(v5)!.accounts.find((x) => x.id === 'a_visa')!
    expect(a.kind).toBe('credit')
    expect(a.creditLimitCents).toBe(600000)
    // El día del banco se guarda tal cual: hay tarjetas que cierran el 30.
    expect(a.closingDay).toBe(30)
    expect(a.dueDay).toBe(22)
  })

  it('un respaldo anterior a las tarjetas se lee como "todavía no cargaste ninguna"', () => {
    const d = parseData(v2)!
    expect(d.cards).toEqual([])
    expect(d.wallets).toEqual([])
  })

  it('el respaldo exportado se las lleva de vuelta', () => {
    const b = toBackup(parseData(v5)!)
    expect(b.cards).toHaveLength(2)
    expect(b.wallets).toHaveLength(1)
  })

  it('descarta la tarjeta que quedó sin cuenta, sin tirar el respaldo entero', () => {
    const d = parseData({ ...v5, cards: [...v5.cards, { id: 'k_x', name: 'Fantasma', kind: 'debit', accountId: 'a_no' }] })!
    expect(d.cards.map((c) => c.id)).toEqual(['k_deb', 'k_cred'])
    expect(d.transactions).toHaveLength(1)
  })

  it('la billetera sobrevive a una tarjeta que no es de su cuenta; se cae la etiqueta', () => {
    const wallets = [{ id: 'w_yape', name: 'Yape', provider: 'yape', accountId: 'a_bcp', cardId: 'k_cred' }]
    const [w] = parseData({ ...v5, wallets })!.wallets
    expect(w.accountId).toBe('a_bcp')
    expect(w.cardId).toBeUndefined()
  })

  it('un movimiento con una tarjeta que ya no existe pierde la etiqueta, no la plata', () => {
    const d = parseData({ ...v5, cards: [] })!
    expect(d.transactions[0].amountCents).toBe(30000)
    expect(d.transactions[0].cardId).toBeUndefined()
  })

  it('rechaza una cuenta con un tipo que el modelo no conoce', () => {
    expect(parseData({ ...v5, accounts: [{ id: 'a_x', name: 'X', kind: 'crypto' }] })).toBe(null)
  })

  it('rechaza un día de cierre que ningún mes tiene', () => {
    const accounts = [{ id: 'a_visa', name: 'Visa', kind: 'credit', closingDay: 32 }]
    expect(parseData({ ...v5, accounts })).toBe(null)
  })
})

describe('parseData — transferencias', () => {
  const transferencia = {
    id: 'tr',
    amountCents: 20000,
    nature: 'transfer',
    accountId: 'a_bcp',
    toAccountId: 'a_visa',
    date: '2026-09-20',
  }

  it('acepta una transferencia con sus dos cuentas', () => {
    const d = parseData({ ...v5, transactions: [transferencia] })!
    expect(d.transactions[0].toAccountId).toBe('a_visa')
  })

  it('rechaza una transferencia sin destino: la plata saldría hacia ningún lado', () => {
    const { toAccountId: _omitido, ...sinDestino } = transferencia
    expect(parseData({ ...v5, transactions: [sinDestino] })).toBe(null)
  })

  it('rechaza una transferencia a su propia cuenta', () => {
    expect(
      parseData({ ...v5, transactions: [{ ...transferencia, toAccountId: 'a_bcp' }] }),
    ).toBe(null)
  })

  it('rechaza un destino colgado de un movimiento que no es transferencia', () => {
    const gasto = { ...transferencia, nature: 'expense', categoryId: 'c_food' }
    expect(parseData({ ...v5, transactions: [gasto] })).toBe(null)
  })

  it('le quita la categoría a una transferencia: borrar esa categoría movería saldos', () => {
    const conCategoria = { ...transferencia, categoryId: 'c_food' }
    const d = parseData({ ...v5, transactions: [conCategoria] })!
    expect(d.transactions[0].categoryId).toBeUndefined()
    expect(d.transactions[0].toAccountId).toBe('a_visa')
  })
})
