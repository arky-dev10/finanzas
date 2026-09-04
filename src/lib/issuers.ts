import type { CardBrand } from '@/types'

/**
 * Emisores de tarjetas en Perú, para elegir en vez de tipear. Catálogo ABIERTO:
 * el campo acepta cualquier texto y esto son solo atajos — una caja de ahorros
 * o un emisor nuevo no tienen por qué quedar afuera de la app.
 *
 * Ordenados por cuán probable es que el usuario los tenga, no alfabéticamente:
 * los cuatro bancos grandes primero, después las tarjetas de retail, que en
 * Perú son la primera tarjeta de crédito de mucha gente.
 */
export const ISSUERS: readonly string[] = [
  'BCP',
  'Interbank',
  'BBVA',
  'Scotiabank',
  'Diners Club',
  'Falabella',
  'Ripley',
  'Oh!',
  'Cencosud',
  'BanBif',
  'Pichincha',
  'Mibanco',
]

export const BRANDS: readonly { id: CardBrand; label: string }[] = [
  { id: 'visa', label: 'Visa' },
  { id: 'mastercard', label: 'Mastercard' },
  { id: 'amex', label: 'Amex' },
  { id: 'diners', label: 'Diners' },
]

export function brandLabel(brand: CardBrand | undefined): string | undefined {
  return BRANDS.find((b) => b.id === brand)?.label
}
