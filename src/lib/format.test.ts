import { describe, expect, it } from 'vitest'
import {
  centsToInput, cycleRange, cycleSublabel, formatMoney, formatMoneyShort, monthKeyFor,
  parseAmountToCents,
} from '@/lib/format'

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

describe('monthKeyFor', () => {
  it('con día 1 es EXACTAMENTE el mes calendario', () => {
    expect(monthKeyFor('2026-08-01', 1)).toBe('2026-08')
    expect(monthKeyFor('2026-08-31', 1)).toBe('2026-08')
    expect(monthKeyFor('2026-12-31', 1)).toBe('2026-12')
  })

  it('desde el día de inicio, la fecha pertenece al mes siguiente', () => {
    expect(monthKeyFor('2026-08-29', 28)).toBe('2026-09')
    expect(monthKeyFor('2026-08-28', 28)).toBe('2026-09')
    expect(monthKeyFor('2026-08-27', 28)).toBe('2026-08')
  })

  it('cruza el año: el fin de diciembre cae en enero', () => {
    expect(monthKeyFor('2026-12-28', 28)).toBe('2027-01')
  })

  it('borde de febrero: el 28-feb abre el ciclo de marzo y el 1-mar sigue en él', () => {
    expect(monthKeyFor('2026-02-27', 28)).toBe('2026-02')
    expect(monthKeyFor('2026-02-28', 28)).toBe('2026-03')
    expect(monthKeyFor('2026-03-01', 28)).toBe('2026-03')
  })
})

describe('cycleRange', () => {
  it('con día 1 va del 1 al último día del mes, febrero bisiesto incluido', () => {
    expect(cycleRange('2026-09', 1)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(cycleRange('2026-02', 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(cycleRange('2028-02', 1)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('arranca en el mes anterior y termina el día previo al inicio', () => {
    expect(cycleRange('2026-09', 28)).toEqual({ from: '2026-08-28', to: '2026-09-27' })
  })

  it('cruza el año hacia atrás en enero', () => {
    expect(cycleRange('2027-01', 28)).toEqual({ from: '2026-12-28', to: '2027-01-27' })
  })

  it('en febrero no bisiesto el ciclo de marzo arranca justo el 28-feb', () => {
    expect(cycleRange('2026-03', 28)).toEqual({ from: '2026-02-28', to: '2026-03-27' })
  })
})

describe('cycleSublabel', () => {
  it('no dice nada con el mes calendario: el nombre del mes ya alcanza', () => {
    expect(cycleSublabel('2026-09', 1)).toBe(null)
  })

  it('resume el rango del ciclo', () => {
    expect(cycleSublabel('2026-09', 28)).toBe('28 ago – 27 sep')
    expect(cycleSublabel('2027-01', 28)).toBe('28 dic – 27 ene')
  })
})
