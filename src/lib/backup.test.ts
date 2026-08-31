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

  it('siembra BCP con saldo pendiente y Efectivo', () => {
    const d = parseData(v2)!
    expect(d.accounts).toEqual([
      { id: 'a_bcp', name: 'BCP', kind: 'bank', balancePending: true },
      { id: 'a_cash', name: 'Efectivo', kind: 'cash' },
    ])
  })

  it('pasa el tope mensual y los presupuestos por categoría a céntimos', () => {
    const d = parseData(v2)!
    expect(d.monthlyBudget).toBe(350000)
    expect(d.categories.find((c) => c.id === 'c_food')!.budget).toBe(50000)
  })

  it('conserva nota y fecha', () => {
    const t2 = parseData(v2)!.transactions.find((t) => t.id === 't2')!
    expect(t2.note).toBe('sueldo')
    expect(t2.date).toBe('2026-08-01')
  })

  it('importa respaldos v1, que no traían tope mensual', () => {
    const { monthlyBudget: _mb, version: _v, ...v1 } = v2
    const d = parseData({ ...v1, version: 1 })!
    expect(d.monthlyBudget).toBe(0)
    expect(d.transactions).toHaveLength(2)
  })

  it('migra también el localStorage viejo, que no tiene campo `version`', () => {
    const { version: _v, exportedAt: _e, ...crudo } = v2
    const d = parseData({ ...crudo, onboarded: true })!
    expect(d.transactions[0].amountCents).toBe(1250)
    expect(d.monthlyBudget).toBe(350000)
  })
})

describe('parseData — datos ya migrados', () => {
  it('no vuelve a multiplicar por 100 al releer lo que acaba de guardar', () => {
    const migrado = parseData(v2)!
    const releido = parseData(JSON.parse(serialize(migrado)))!
    expect(releido.transactions.map((t) => t.amountCents)).toEqual([1250, 300000])
    expect(releido.monthlyBudget).toBe(350000)
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
      accounts: [{ id: 'a_cash', name: 'Efectivo', kind: 'cash' }],
      categories: [],
      transactions: [
        { id: 't1', amountCents: -500, nature: 'adjustment', accountId: 'a_cash', date: '2026-08-01' },
        { id: 't2', amountCents: 900, nature: 'refund', accountId: 'a_cash', categoryId: 'c_food', medium: 'yape', date: '2026-08-02' },
      ],
    })!
    expect(d.accounts).toHaveLength(1)
    expect(d.transactions[0].amountCents).toBe(-500)
    expect(d.transactions[1].medium).toBe('yape')
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
    expect(BACKUP_VERSION).toBe(3)
    expect(b.accounts).toHaveLength(2)
  })

  it('se llama por la marca, no por el nombre viejo del repo', () => {
    expect(backupFilename(new Date(2026, 7, 31))).toBe('kumi-2026-08-31.json')
  })
})
