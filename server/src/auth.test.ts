import { describe, expect, it } from 'vitest'
import { hashPin, hashToken, isValidPin, lockoutMs, newToken, normalizeUsername, verifyPin } from './auth.ts'

describe('isValidPin', () => {
  it('acepta exactamente 6 dígitos', () => {
    expect(isValidPin('012345')).toBe(true)
  })

  it('rechaza lo que no sean 6 dígitos', () => {
    expect(isValidPin('12345')).toBe(false)
    expect(isValidPin('1234567')).toBe(false)
    expect(isValidPin('12345a')).toBe(false)
    expect(isValidPin('12 345')).toBe(false)
    expect(isValidPin('')).toBe(false)
  })
})

describe('normalizeUsername', () => {
  it('no distingue mayúsculas ni espacios de los costados', () => {
    expect(normalizeUsername('  Estephano  ')).toBe('estephano')
  })

  it('rechaza lo que no sirve como identificador', () => {
    expect(normalizeUsername('')).toBe(null)
    expect(normalizeUsername('ab')).toBe(null)
    expect(normalizeUsername('con espacio')).toBe(null)
    expect(normalizeUsername('a'.repeat(33))).toBe(null)
  })

  it('deja pasar guiones, guión bajo y números', () => {
    expect(normalizeUsername('este_pha-no9')).toBe('este_pha-no9')
  })
})

/*
 * El PIN de 6 dígitos son 10^6 combinaciones: sin freno, se agota en minutos.
 * Toda la seguridad real está en esta curva, así que va fijada con números,
 * no con la fórmula (un test que recalcula la fórmula no puede contradecirla).
 */
describe('lockoutMs', () => {
  it('deja dos errores libres, que son los del usuario legítimo', () => {
    expect(lockoutMs(1)).toBe(0)
    expect(lockoutMs(2)).toBe(0)
  })

  it('duplica la espera a partir del tercero', () => {
    expect(lockoutMs(3)).toBe(15_000)
    expect(lockoutMs(4)).toBe(30_000)
    expect(lockoutMs(5)).toBe(60_000)
    expect(lockoutMs(6)).toBe(120_000)
  })

  it('corta el crecimiento en 30 minutos', () => {
    expect(lockoutMs(10)).toBe(1_800_000)
    expect(lockoutMs(50)).toBe(1_800_000)
    expect(lockoutMs(5000)).toBe(1_800_000)
  })
})

describe('hash del PIN', () => {
  it('usa argon2id, no otra variante ni un hash pelado', async () => {
    // Fijado sobre el hash real y no sobre la config: es lo que termina en la base.
    expect(await hashPin('314159')).toMatch(/^\$argon2id\$v=19\$/)
  })

  it('sala: dos veces el mismo PIN no da el mismo hash', async () => {
    expect(await hashPin('314159')).not.toBe(await hashPin('314159'))
  })

  it('verifica el PIN correcto y rechaza el resto', async () => {
    const h = await hashPin('314159')
    expect(await verifyPin(h, '314159')).toBe(true)
    expect(await verifyPin(h, '314158')).toBe(false)
  })

  it('no explota con un hash corrupto en la base', async () => {
    expect(await verifyPin('no-es-un-hash', '314159')).toBe(false)
  })
})

describe('tokens de sesión', () => {
  it('no se repiten', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newToken()))
    expect(tokens.size).toBe(200)
  })

  it('trae al menos 256 bits de aleatoriedad', () => {
    // base64url: 4 caracteres por cada 3 bytes.
    expect(newToken().length).toBeGreaterThanOrEqual(43)
  })

  it('no viaja en la URL: es opaco y sin caracteres que haya que escapar', () => {
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('se guarda hasheado, nunca en claro', () => {
    const t = newToken()
    expect(hashToken(t)).not.toBe(t)
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).toHaveLength(64)
  })
})
