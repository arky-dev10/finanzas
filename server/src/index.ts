import { serve } from '@hono/node-server'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

/*
 * Sin destino de deploy fijado todavía: todo lo que cambia entre entornos entra
 * por env var y nada tiene un default que solo sirva en la máquina de alguien.
 */
const PORT = Number(process.env.PORT ?? 8787)
const DB_PATH = process.env.DB_PATH ?? './data/kumi.db'
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*'
// Solo con un proxy propio adelante: si no, cualquiera manda x-forwarded-for y
// se saltea el límite por IP con un header inventado.
const TRUST_PROXY = process.env.TRUST_PROXY === '1'

mkdirSync(dirname(DB_PATH), { recursive: true })
const db = openDb(DB_PATH)

// Las sesiones vencidas no se borran solas al vencer: se limpian al arrancar
// para que la tabla no crezca para siempre.
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())

const app = createApp({ db, now: () => Date.now(), trustProxy: TRUST_PROXY, allowedOrigin: ALLOWED_ORIGIN })

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`kumi-server escuchando en :${info.port} · db ${DB_PATH} · origen ${ALLOWED_ORIGIN}`)
  if (!TRUST_PROXY) console.log('TRUST_PROXY apagado: el límite por IP usa una sola clave para todos.')
})
