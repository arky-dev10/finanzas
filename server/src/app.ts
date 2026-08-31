import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'
import type { Db } from './db.ts'
import {
  DUMMY_PIN_HASH,
  hashPin,
  hashToken,
  isValidPin,
  lockoutMs,
  newToken,
  normalizeUsername,
  verifyPin,
} from './auth.ts'

export interface Deps {
  db: Db
  now: () => number
  /** Solo detrás de un proxy propio: si no, cualquiera falsea su IP con un header. */
  trustProxy: boolean
  allowedOrigin?: string
  /** Techo del respaldo subido. Un respaldo real ronda las decenas de KB. */
  maxBlobBytes?: number
}

const SESSION_MS = 30 * 24 * 60 * 60 * 1000

const DEFAULT_MAX_BLOB_BYTES = 2_000_000

/**
 * Lo mínimo para reconocer un respaldo de Kumi, y nada más. El server guarda el
 * blob opaco a propósito: si validara el modelo financiero, cada cambio del
 * modelo —- y van cuatro —- necesitaría un deploy del server para no rechazar a
 * los clientes nuevos. `looseObject` deja pasar los campos que todavía no existen.
 */
const blobDeRespaldo = z.looseObject({
  version: z.number(),
  accounts: z.array(z.unknown()),
  categories: z.array(z.unknown()),
  transactions: z.array(z.unknown()),
})

const subida = z.object({
  data: blobDeRespaldo,
  baseRevision: z.number().int().min(0),
})

const credentials = z.object({
  username: z.string().max(64),
  pin: z.string().max(32),
})

/** Mismo cuerpo para PIN equivocado y usuario inexistente. */
const BAD_CREDENTIALS = { error: 'bad_credentials' as const }

function clientIp(c: { req: { header: (n: string) => string | undefined } }, trustProxy: boolean): string {
  if (!trustProxy) return 'directo'
  const fwd = c.req.header('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || 'desconocido'
}

export function createApp(deps: Deps) {
  const { db, now } = deps
  const app = new Hono()

  app.use('/api/*', cors({ origin: deps.allowedOrigin ?? '*', allowHeaders: ['content-type', 'authorization'] }))

  /* ---------- bloqueo progresivo ---------- */

  const leerUsuario = db.prepare('SELECT * FROM users WHERE username = ?')
  const leerIp = db.prepare('SELECT * FROM ip_attempts WHERE ip = ?')

  /** Segundos que faltan para poder volver a intentar, o 0 si se puede ya. */
  function esperaPendiente(ip: string, username: string | null): number {
    const filas = [leerIp.get(ip), username ? leerUsuario.get(username) : undefined]
    const hasta = filas.reduce<number>((max, f) => Math.max(max, Number(f?.locked_until ?? 0)), 0)
    return hasta > now() ? Math.ceil((hasta - now()) / 1000) : 0
  }

  /** Anota el fallo y devuelve los segundos de espera que quedaron, o 0. */
  function anotarFallo(ip: string, username: string | null): number {
    const fallosIp = Number(leerIp.get(ip)?.failed_attempts ?? 0) + 1
    const hastaIp = lockoutMs(fallosIp) === 0 ? null : now() + lockoutMs(fallosIp)
    db.prepare(
      `INSERT INTO ip_attempts (ip, failed_attempts, locked_until) VALUES (?, ?, ?)
       ON CONFLICT(ip) DO UPDATE SET failed_attempts = excluded.failed_attempts,
                                     locked_until = excluded.locked_until`,
    ).run(ip, fallosIp, hastaIp)

    if (username !== null && leerUsuario.get(username)) {
      const fallos = Number(leerUsuario.get(username)?.failed_attempts ?? 0) + 1
      const hasta = lockoutMs(fallos) === 0 ? null : now() + lockoutMs(fallos)
      db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE username = ?').run(fallos, hasta, username)
    }
    // El intento que dispara el bloqueo ya avisa cuánto esperar, en vez de
    // dejar que el usuario lo descubra en el intento siguiente.
    return esperaPendiente(ip, username)
  }

  function limpiarFallos(ip: string, username: string) {
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE username = ?').run(username)
    db.prepare('DELETE FROM ip_attempts WHERE ip = ?').run(ip)
  }

  /* ---------- sesión ---------- */

  function abrirSesion(username: string): { token: string; expiresAt: string } {
    const token = newToken()
    const expira = now() + SESSION_MS
    db.prepare('INSERT INTO sessions (token_hash, username, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      hashToken(token),
      username,
      new Date(now()).toISOString(),
      expira,
    )
    return { token, expiresAt: new Date(expira).toISOString() }
  }

  function usuarioDelToken(header: string | undefined): string | null {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return null
    const fila = db.prepare('SELECT username, expires_at FROM sessions WHERE token_hash = ?').get(hashToken(token))
    if (!fila) return null
    if (Number(fila.expires_at) <= now()) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
      return null
    }
    return String(fila.username)
  }

  /* ---------- rutas ---------- */

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.post('/api/register', async (c) => {
    const cuerpo = credentials.safeParse(await c.req.json().catch(() => null))
    if (!cuerpo.success) return c.json({ error: 'bad_request' }, 400)

    const username = normalizeUsername(cuerpo.data.username)
    if (!username) return c.json({ error: 'bad_username' }, 400)
    if (!isValidPin(cuerpo.data.pin)) return c.json({ error: 'bad_pin' }, 400)

    const ip = clientIp(c, deps.trustProxy)
    const espera = esperaPendiente(ip, null)
    if (espera > 0) return locked(c, espera)

    if (leerUsuario.get(username)) {
      // Registrar SÍ revela que el usuario existe: no hay forma de que alguien
      // elija su nombre sin saberlo. Lo frena el mismo límite por IP.
      const espera = anotarFallo(ip, null)
      return espera > 0 ? locked(c, espera) : c.json({ error: 'username_taken' }, 409)
    }

    db.prepare('INSERT INTO users (username, pin_hash, created_at) VALUES (?, ?, ?)').run(
      username,
      await hashPin(cuerpo.data.pin),
      new Date(now()).toISOString(),
    )
    return c.json({ username, ...abrirSesion(username) }, 201)
  })

  app.post('/api/login', async (c) => {
    const cuerpo = credentials.safeParse(await c.req.json().catch(() => null))
    if (!cuerpo.success) return c.json(BAD_CREDENTIALS, 401)

    const username = normalizeUsername(cuerpo.data.username)
    const ip = clientIp(c, deps.trustProxy)
    const espera = esperaPendiente(ip, username)
    if (espera > 0) return locked(c, espera)

    const fila = username ? leerUsuario.get(username) : undefined
    // Verificamos igual contra un hash de mentira si el usuario no existe, para
    // tardar lo mismo en los dos casos.
    const ok = await verifyPin(String(fila?.pin_hash ?? DUMMY_PIN_HASH), cuerpo.data.pin)

    if (!fila || !ok) {
      const espera = anotarFallo(ip, fila ? username : null)
      return espera > 0 ? locked(c, espera) : c.json(BAD_CREDENTIALS, 401)
    }

    limpiarFallos(ip, String(fila.username))
    return c.json({ username: String(fila.username), ...abrirSesion(String(fila.username)) })
  })

  app.post('/api/logout', (c) => {
    const header = c.req.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
    return c.body(null, 204)
  })

  app.get('/api/data', (c) => {
    const username = usuarioDelToken(c.req.header('authorization'))
    if (!username) return c.json({ error: 'unauthorized' }, 401)
    const fila = db.prepare('SELECT data, revision, updated_at FROM vaults WHERE username = ?').get(username)
    if (!fila) return c.body(null, 204)
    return c.json({
      data: JSON.parse(String(fila.data)),
      revision: Number(fila.revision),
      updatedAt: String(fila.updated_at),
    })
  })

  app.put('/api/data', async (c) => {
    const username = usuarioDelToken(c.req.header('authorization'))
    if (!username) return c.json({ error: 'unauthorized' }, 401)

    const crudo = await c.req.text()
    const limite = deps.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES
    if (Buffer.byteLength(crudo) > limite) return c.json({ error: 'too_large', maxBytes: limite }, 413)

    const cuerpo = subida.safeParse(JSON.parse(crudo) as unknown)
    if (!cuerpo.success) return c.json({ error: 'bad_request' }, 400)

    const actual = db.prepare('SELECT data, revision, updated_at FROM vaults WHERE username = ?').get(username)
    const revisionServer = Number(actual?.revision ?? 0)

    // El cliente dice de qué revisión partió. Si el server ya avanzó, otro
    // dispositivo subió en el medio: no pisamos, devolvemos lo que hay.
    if (revisionServer !== cuerpo.data.baseRevision) {
      return c.json(
        {
          error: 'conflict',
          revision: revisionServer,
          updatedAt: actual ? String(actual.updated_at) : null,
          data: actual ? JSON.parse(String(actual.data)) : null,
        },
        409,
      )
    }

    const revision = revisionServer + 1
    const updatedAt = new Date(now()).toISOString()
    db.prepare(
      `INSERT INTO vaults (username, data, revision, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET data = excluded.data,
                                           revision = excluded.revision,
                                           updated_at = excluded.updated_at`,
    ).run(username, JSON.stringify(cuerpo.data.data), revision, updatedAt)
    return c.json({ revision, updatedAt })
  })

  return app
}

function locked(c: { json: (b: unknown, s: 429, h?: Record<string, string>) => Response }, segundos: number) {
  return c.json({ error: 'locked', retryAfterSeconds: segundos }, 429, { 'retry-after': String(segundos) })
}
