import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

/** `Response.json()` devuelve `unknown`; en los tests el shape lo fija el assert. */
// oxlint-disable-next-line no-explicit-any
const json = (r: Response): Promise<any> => r.json()

let reloj = Date.parse('2026-09-01T10:00:00.000Z')
let app: ReturnType<typeof createApp>

beforeEach(() => {
  reloj = Date.parse('2026-09-01T10:00:00.000Z')
  app = createApp({ db: openDb(':memory:'), now: () => reloj, trustProxy: true })
})

const IP = { 'x-forwarded-for': '190.0.0.1' }

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...IP, ...headers },
    body: JSON.stringify(body),
  })
}

const registrar = (username = 'estephano', pin = '314159') => post('/api/register', { username, pin })
const entrar = (pin: string, username = 'estephano') => post('/api/login', { username, pin })

describe('POST /api/register', () => {
  it('crea la cuenta y deja el dispositivo vinculado de una', async () => {
    const r = await registrar()
    expect(r.status).toBe(201)
    const body = await json(r)
    expect(typeof body.token).toBe('string')
    expect(body.username).toBe('estephano')
    expect(typeof body.expiresAt).toBe('string')
  })

  it('no distingue mayúsculas en el usuario', async () => {
    await registrar()
    const r = await registrar('ESTEPHANO')
    expect(r.status).toBe(409)
  })

  it('rechaza un PIN que no sean 6 dígitos', async () => {
    expect((await registrar('otro', '12345')).status).toBe(400)
    expect((await registrar('otro', 'abcdef')).status).toBe(400)
  })

  it('rechaza un usuario que no sirve de identificador', async () => {
    expect((await registrar('ab')).status).toBe(400)
    expect((await registrar('con espacio')).status).toBe(400)
  })

  it('nunca devuelve el PIN ni su hash', async () => {
    const crudo = await (await registrar()).text()
    expect(crudo).not.toContain('314159')
    expect(crudo).not.toContain('argon2')
  })
})

describe('POST /api/login', () => {
  beforeEach(async () => {
    await registrar()
  })

  it('devuelve un token nuevo con el PIN correcto', async () => {
    const r = await entrar('314159')
    expect(r.status).toBe(200)
    expect((await json(r)).token).toBeTypeOf('string')
  })

  it('rechaza el PIN equivocado', async () => {
    expect((await entrar('999999')).status).toBe(401)
  })

  it('responde igual ante un usuario que no existe', async () => {
    // Si respondiera distinto, alcanzaría para saber quién está registrado.
    const inexistente = await post('/api/login', { username: 'fantasma', pin: '314159' })
    const malPin = await entrar('999999')
    expect(inexistente.status).toBe(malPin.status)
    expect(await json(inexistente)).toEqual(await json(malPin))
  })
})

describe('bloqueo progresivo', () => {
  beforeEach(async () => {
    await registrar()
  })

  it('deja pasar dos errores y bloquea al tercero', async () => {
    expect((await entrar('000001')).status).toBe(401)
    expect((await entrar('000002')).status).toBe(401)
    const r = await entrar('000003')
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBe(15)
  })

  it('no deja entrar ni con el PIN correcto mientras está bloqueado', async () => {
    for (const pin of ['000001', '000002', '000003']) await entrar(pin)
    expect((await entrar('314159')).status).toBe(429)
  })

  it('vuelve a dejar intentar cuando pasa la espera', async () => {
    for (const pin of ['000001', '000002', '000003']) await entrar(pin)
    reloj += 15_000
    expect((await entrar('314159')).status).toBe(200)
  })

  it('duplica la espera si se sigue fallando', async () => {
    for (const pin of ['000001', '000002', '000003']) await entrar(pin)
    reloj += 15_000
    const r = await entrar('000004')
    expect(r.status).toBe(429)
    expect(Number(r.headers.get('retry-after'))).toBe(30)
  })

  it('borra la cuenta de errores al entrar bien', async () => {
    await entrar('000001')
    await entrar('000002')
    await entrar('314159')
    expect((await entrar('000003')).status).toBe(401)
  })

  it('cuenta también por IP, para que no sirva rotar usuarios', async () => {
    await registrar('otra-persona', '271828')
    await post('/api/login', { username: 'estephano', pin: '000001' })
    await post('/api/login', { username: 'otra-persona', pin: '000002' })
    const r = await post('/api/login', { username: 'estephano', pin: '000003' })
    expect(r.status).toBe(429)
  })

  it('no castiga a una IP distinta por los errores de otra', async () => {
    for (const pin of ['000001', '000002', '000003']) await entrar(pin)
    const otraIp = await app.request('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '201.0.0.9' },
      body: JSON.stringify({ username: 'estephano', pin: '314159' }),
    })
    // El usuario sigue bloqueado por su propio contador, no por el de la IP.
    expect(otraIp.status).toBe(429)
    expect(await json(otraIp)).toMatchObject({ error: 'locked' })
  })
})

describe('el token de sesión', () => {
  it('abre las rutas protegidas', async () => {
    const { token } = await json(await registrar())
    const r = await app.request('/api/data', { headers: { authorization: `Bearer ${token}` } })
    expect(r.status).toBe(204)
  })

  it('sin token no se entra', async () => {
    expect((await app.request('/api/data')).status).toBe(401)
  })

  it('un token inventado no sirve', async () => {
    const r = await app.request('/api/data', { headers: { authorization: 'Bearer no-soy-un-token' } })
    expect(r.status).toBe(401)
  })

  it('caduca', async () => {
    const { token } = await json(await registrar())
    reloj += 31 * 24 * 60 * 60 * 1000
    const r = await app.request('/api/data', { headers: { authorization: `Bearer ${token}` } })
    expect(r.status).toBe(401)
  })

  it('se puede cerrar sesión y el token deja de valer', async () => {
    const { token } = await json(await registrar())
    const auth = { authorization: `Bearer ${token}` }
    expect((await app.request('/api/logout', { method: 'POST', headers: auth })).status).toBe(204)
    expect((await app.request('/api/data', { headers: auth })).status).toBe(401)
  })
})
