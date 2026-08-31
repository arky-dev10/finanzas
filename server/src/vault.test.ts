import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { openDb } from './db.ts'

/** `Response.json()` devuelve `unknown`; en los tests el shape lo fija el assert. */
// oxlint-disable-next-line no-explicit-any
const json = (r: Response): Promise<any> => r.json()

let reloj = Date.parse('2026-09-01T10:00:00.000Z')
let app: ReturnType<typeof createApp>
let token = ''

/** Un respaldo v4 mínimo: el server no entiende el modelo, solo su forma. */
const respaldo = (nota = 'almuerzo') => ({
  version: 4,
  exportedAt: '2026-09-01T10:00:00.000Z',
  monthlyBudgetCents: 350000,
  accounts: [{ id: 'a_bcp', name: 'BCP', kind: 'bank' }],
  categories: [{ id: 'c_food', name: 'Comida', icon: 'utensils', color: '#eb6834', type: 'expense' }],
  transactions: [
    { id: 't1', amountCents: 1250, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-09-01', note: nota },
  ],
})

async function nuevoToken(username: string, pin = '314159') {
  const r = await app.request('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, pin }),
  })
  return (await json(r)).token as string
}

function push(body: unknown, t = token) {
  return app.request('/api/data', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
    body: JSON.stringify(body),
  })
}

const pull = (t = token) => app.request('/api/data', { headers: { authorization: `Bearer ${t}` } })

beforeEach(async () => {
  reloj = Date.parse('2026-09-01T10:00:00.000Z')
  app = createApp({ db: openDb(':memory:'), now: () => reloj, trustProxy: false, maxBlobBytes: 500_000 })
  token = await nuevoToken('estephano')
})

describe('subir y bajar el respaldo', () => {
  it('la primera subida va contra la revisión 0', async () => {
    const r = await push({ data: respaldo(), baseRevision: 0 })
    expect(r.status).toBe(200)
    expect(await json(r)).toMatchObject({ revision: 1 })
  })

  it('devuelve el respaldo tal cual se subió', async () => {
    await push({ data: respaldo(), baseRevision: 0 })
    const body = await json(await pull())
    expect(body.data).toEqual(respaldo())
    expect(body.revision).toBe(1)
    expect(body.updatedAt).toBe('2026-09-01T10:00:00.000Z')
  })

  it('cada subida avanza la revisión', async () => {
    await push({ data: respaldo(), baseRevision: 0 })
    const r = await push({ data: respaldo('cena'), baseRevision: 1 })
    expect(await json(r)).toMatchObject({ revision: 2 })
  })

  it('el reloj del server manda, no el del dispositivo', async () => {
    await push({ data: respaldo(), baseRevision: 0 })
    reloj += 3600_000
    await push({ data: respaldo('cena'), baseRevision: 1 })
    expect((await json(await pull())).updatedAt).toBe('2026-09-01T11:00:00.000Z')
  })
})

describe('conflicto entre dos dispositivos', () => {
  it('rechaza la subida que pisaría algo más nuevo', async () => {
    await push({ data: respaldo('del celular'), baseRevision: 0 })
    // La tablet venía de la revisión 0 y no se enteró de la subida del celular.
    const r = await push({ data: respaldo('de la tablet'), baseRevision: 0 })
    expect(r.status).toBe(409)
  })

  it('devuelve lo que hay en el server para que el cliente resuelva', async () => {
    await push({ data: respaldo('del celular'), baseRevision: 0 })
    const body = await json(await push({ data: respaldo('de la tablet'), baseRevision: 0 }))
    expect(body).toMatchObject({ error: 'conflict', revision: 1 })
    expect(body.data.transactions[0].note).toBe('del celular')
  })

  it('no pierde lo que ya estaba subido', async () => {
    await push({ data: respaldo('del celular'), baseRevision: 0 })
    await push({ data: respaldo('de la tablet'), baseRevision: 0 })
    expect((await json(await pull())).data.transactions[0].note).toBe('del celular')
  })

  it('deja subir después de traerse la revisión buena', async () => {
    await push({ data: respaldo('del celular'), baseRevision: 0 })
    const { revision } = await json(await pull())
    const r = await push({ data: respaldo('fusionado'), baseRevision: revision })
    expect(r.status).toBe(200)
    expect((await json(await pull())).data.transactions[0].note).toBe('fusionado')
  })

  it('rechaza una revisión base del futuro', async () => {
    expect((await push({ data: respaldo(), baseRevision: 7 })).status).toBe(409)
  })
})

describe('el server no entiende el modelo, pero sí su forma', () => {
  it('rechaza algo que no es un respaldo', async () => {
    expect((await push({ data: 'hola', baseRevision: 0 })).status).toBe(400)
    expect((await push({ data: { version: 4 }, baseRevision: 0 })).status).toBe(400)
    expect((await push({ baseRevision: 0 })).status).toBe(400)
  })

  it('deja pasar campos que todavía no existen, sin tocarlos', async () => {
    // El modelo cambió cuatro veces ya: el server no puede ser el que frene.
    const futuro = { ...respaldo(), version: 9, loans: [{ id: 'l1' }] }
    expect((await push({ data: futuro, baseRevision: 0 })).status).toBe(200)
    expect((await json(await pull())).data.loans).toEqual([{ id: 'l1' }])
  })

  it('rechaza un respaldo más grande que el límite', async () => {
    const enorme = { ...respaldo(), note: 'x'.repeat(600_000) }
    expect((await push({ data: enorme, baseRevision: 0 })).status).toBe(413)
  })
})

describe('cada quien ve solo lo suyo', () => {
  it('el respaldo de uno no aparece en la cuenta del otro', async () => {
    await push({ data: respaldo('mío'), baseRevision: 0 })
    const otro = await nuevoToken('otra-persona', '271828')
    expect((await pull(otro)).status).toBe(204)
  })

  it('subir con la cuenta de otro no pisa la mía', async () => {
    await push({ data: respaldo('mío'), baseRevision: 0 })
    const otro = await nuevoToken('otra-persona', '271828')
    await push({ data: respaldo('ajeno'), baseRevision: 0 }, otro)
    expect((await json(await pull())).data.transactions[0].note).toBe('mío')
  })

  it('sin token no se sube nada', async () => {
    const r = await app.request('/api/data', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: respaldo(), baseRevision: 0 }),
    })
    expect(r.status).toBe(401)
  })
})
