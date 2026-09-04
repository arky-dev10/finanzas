import { describe, expect, it } from 'vitest'
import { cardCycle, dayInMonth, dueLabel, nextDay } from '@/lib/cards'

describe('dayInMonth', () => {
  it('recorta el día al último que el mes tenga', () => {
    // Una tarjeta que cierra el 30 cierra el 28 en febrero: el dato del banco
    // se guarda como 30 y se recorta acá, no al guardarlo (ADR 0004, D3).
    expect(dayInMonth('2026-02', 30)).toBe('2026-02-28')
    expect(dayInMonth('2028-02', 30)).toBe('2028-02-29') // bisiesto
    expect(dayInMonth('2026-04', 31)).toBe('2026-04-30')
    expect(dayInMonth('2026-09', 5)).toBe('2026-09-05')
  })
})

describe('nextDay', () => {
  it('cruza fin de mes y fin de año', () => {
    expect(nextDay('2026-09-05')).toBe('2026-09-06')
    expect(nextDay('2026-09-30')).toBe('2026-10-01')
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
    expect(nextDay('2026-02-28')).toBe('2026-03-01')
    expect(nextDay('2028-02-28')).toBe('2028-02-29')
  })
})

describe('cardCycle', () => {
  it('cierra el 5 y vence el 22 del mismo mes', () => {
    // El 10 de septiembre: el cierre del 5 ya pasó, vence el 22 de septiembre.
    expect(cardCycle(5, 22, '2026-09-10')).toEqual({
      closedFrom: '2026-08-06',
      closedTo: '2026-09-05',
      dueDate: '2026-09-22',
      openFrom: '2026-09-06',
      openTo: '2026-10-05',
    })
  })

  it('antes del cierre, el período facturado es el del mes anterior', () => {
    const c = cardCycle(5, 22, '2026-09-03')
    expect(c.closedTo).toBe('2026-08-05')
    expect(c.dueDate).toBe('2026-08-22')
    expect(c.openTo).toBe('2026-09-05')
  })

  it('el día del cierre el período TODAVÍA está abierto', () => {
    // Lo comprado el día del cierre entra a esa facturación, así que el
    // período no se da por cerrado hasta que el día pasa.
    const c = cardCycle(5, 22, '2026-09-05')
    expect(c.closedTo).toBe('2026-08-05')
    expect(c.openTo).toBe('2026-09-05')
    expect(cardCycle(5, 22, '2026-09-06').closedTo).toBe('2026-09-05')
  })

  it('si el día de pago es anterior al de cierre, vence el mes siguiente', () => {
    // Cierra el 30, paga el 18: el pago no puede ser del mismo mes.
    const c = cardCycle(30, 18, '2026-10-05')
    expect(c.closedTo).toBe('2026-09-30')
    expect(c.dueDate).toBe('2026-10-18')
  })

  it('una tarjeta que cierra el 30 cierra el 28 en febrero, y el ciclo sigue pegado', () => {
    const c = cardCycle(30, 18, '2026-03-02')
    expect(c.closedTo).toBe('2026-02-28')
    expect(c.closedFrom).toBe('2026-01-31')
    expect(c.dueDate).toBe('2026-03-18')
    expect(c.openFrom).toBe('2026-03-01')
    expect(c.openTo).toBe('2026-03-30')
  })

  it('el período en curso arranca justo donde termina el facturado, sin huecos', () => {
    for (const hoy of ['2026-01-15', '2026-02-28', '2026-03-01', '2026-12-31']) {
      const c = cardCycle(30, 18, hoy)
      expect(nextDay(c.closedTo)).toBe(c.openFrom)
      expect(c.closedFrom <= c.closedTo).toBe(true)
      expect(c.openFrom <= c.openTo).toBe(true)
    }
  })

  it('cruza el año sin perder el hilo', () => {
    const c = cardCycle(28, 15, '2027-01-05')
    expect(c.closedTo).toBe('2026-12-28')
    expect(c.dueDate).toBe('2027-01-15')
  })
})

describe('dueLabel', () => {
  it('dice cuánto falta, o cuánto hace que se pasó', () => {
    expect(dueLabel('2026-09-22', '2026-09-04')).toBe('vence en 18 días')
    expect(dueLabel('2026-09-04', '2026-09-04')).toBe('vence hoy')
    expect(dueLabel('2026-09-05', '2026-09-04')).toBe('vence mañana')
    expect(dueLabel('2026-09-01', '2026-09-04')).toBe('venció hace 3 días')
    expect(dueLabel('2026-09-03', '2026-09-04')).toBe('venció ayer')
  })
})
