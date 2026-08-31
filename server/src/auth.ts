import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2'

/**
 * El PIN es de 6 dígitos por pedido del usuario: 10^6 combinaciones, que sin
 * freno se agotan en minutos. Toda la seguridad real de este login está en el
 * bloqueo progresivo de abajo, no en el hash — el hash solo protege la base si
 * se filtra. Ver el README del server para el riesgo residual.
 */
export const PIN_LENGTH = 6

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

/** Minúsculas y sin espacios de los costados; null si no sirve de identificador. */
export function normalizeUsername(raw: string): string | null {
  const u = raw.trim().toLowerCase()
  return /^[a-z0-9_-]{3,32}$/.test(u) ? u : null
}

const LOCKOUT_FREE_ATTEMPTS = 2
const LOCKOUT_BASE_MS = 15_000
const LOCKOUT_MAX_MS = 1_800_000

/**
 * Cuánto queda bloqueado el login tras `failed` intentos fallidos seguidos.
 *
 * Dos errores salen gratis, que son los que comete quien se equivoca de verdad.
 * Del tercero en adelante la espera se duplica hasta el techo de 30 minutos, o
 * sea 48 intentos por día: recorrer las 10^6 combinaciones a ese ritmo lleva
 * unos 57 años. Ese número es el que sostiene el PIN de 6 dígitos.
 */
export function lockoutMs(failed: number): number {
  if (failed <= LOCKOUT_FREE_ATTEMPTS) return 0
  const escalado = LOCKOUT_BASE_MS * 2 ** (failed - LOCKOUT_FREE_ATTEMPTS - 1)
  return Math.min(escalado, LOCKOUT_MAX_MS)
}

/* ---------- PIN ---------- */

/*
 * Sin opciones: el default de @node-rs/argon2 YA es argon2id con parámetros
 * sanos (m=19456, t=2, p=1). No se importa su enum `Algorithm` porque está
 * declarado como const enum ambiente y no se puede importar con
 * `verbatimModuleSyntax`. Que sea argon2id de verdad lo fija un test sobre el
 * hash producido, que es mejor garantía que una línea de config.
 */
export function hashPin(pin: string): Promise<string> {
  return argonHash(pin)
}

export function verifyPin(hash: string, pin: string): Promise<boolean> {
  return argonVerify(hash, pin).catch(() => false)
}

/**
 * Hash de un PIN que no existe, para gastar el mismo tiempo cuando el usuario
 * tampoco existe. Sin esto, el login responde más rápido ante un usuario
 * inexistente y eso solo alcanza para enumerar quién está registrado.
 */
export const DUMMY_PIN_HASH = await hashPin('000000')

/* ---------- sesión ---------- */

/** 32 bytes de aleatoriedad real, en base64url para que no haya nada que escapar. */
export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Lo que se guarda en la base: el token en claro solo lo tiene el dispositivo. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Comparación de hashes en tiempo constante. */
export function sameToken(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}
