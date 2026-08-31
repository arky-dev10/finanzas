import { describe, expect, it } from 'vitest'
import { centsToInput, formatMoney, formatMoneyShort, parseAmountToCents } from '@/lib/format'

/** Intl mete un espacio duro entre el símbolo y el número. */
const money = (cents: number) => formatMoney(cents).replace(/\s/g, ' ')

describe('formatMoney', () => {
  it('recibe céntimos y muestra soles', () => {
    expect(money(1250)).toBe('S/ 12.50')
  })

  it('no pierde el céntimo suelto', () => {
    expect(money(1)).toBe('S/ 0.01')
  })

  it('muestra negativos (un ajuste puede bajar el saldo)', () => {
    expect(money(-1250)).toBe('-S/ 12.50')
  })
})

describe('formatMoneyShort', () => {
  it('abrevia miles de soles a partir de céntimos', () => {
    expect(formatMoneyShort(350000)).toBe('3.5k')
  })

  it('deja los montos chicos en soles enteros', () => {
    expect(formatMoneyShort(85000)).toBe('850')
  })
})

describe('parseAmountToCents', () => {
  it('convierte lo que tipea el usuario a céntimos', () => {
    expect(parseAmountToCents('12.50')).toBe(1250)
  })

  it('completa el decimal suelto', () => {
    expect(parseAmountToCents('12.5')).toBe(1250)
  })

  it('acepta enteros', () => {
    expect(parseAmountToCents('3500')).toBe(350000)
  })

  /* 8.165 en coma flotante es 816.4999...: redondear el float da 816. */
  it('no arrastra error de coma flotante', () => {
    expect(parseAmountToCents('0.29')).toBe(29)
    expect(parseAmountToCents('1.15')).toBe(115)
  })

  it('rechaza lo que no es un monto', () => {
    expect(parseAmountToCents('')).toBe(null)
    expect(parseAmountToCents('.')).toBe(null)
    expect(parseAmountToCents('abc')).toBe(null)
  })
})

describe('centsToInput', () => {
  it('devuelve el monto tipeable para precargar el input al editar', () => {
    expect(centsToInput(1250)).toBe('12.50')
    expect(centsToInput(350000)).toBe('3500.00')
  })
})
