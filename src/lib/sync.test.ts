import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSyncState, link, resolveConflict, syncNow, unlink } from '@/lib/sync'
import { getData, replaceData } from '@/lib/store'
import { toBackup } from '@/lib/backup'
import type { Data } from '@/lib/backup'
import type { Account, Category, Transaction } from '@/types'

const URL_BASE = 'https://kumi.example'

const CUENTAS: Account[] = [{ id: 'a_bcp', name: 'BCP', kind: 'bank' }]
const CATEGORIAS: Category[] = [
  { id: 'c_food', name: 'Comida', icon: 'utensils', color: '#eb6834', type: 'expense' },
]
const gasto = (id: string, cents: number): Transaction => ({
  id, amountCents: cents, nature: 'expense', accountId: 'a_bcp', categoryId: 'c_food', date: '2026-09-01',
})

function datosLocales(txs: Transaction[]): Data {
  return { accounts: CUENTAS, cards: [], wallets: [], reminders: [], categories: CATEGORIAS, transactions: txs, monthlyBudgetCents: 0, monthStartDay: 1, onboarded: true }
}

/** Server de mentira: guarda un blob y una revisión, como el de verdad. */
function servidorFalso() {
  const estado: { data: unknown; revision: number; updatedAt: string } = {
    data: null, revision: 0, updatedAt: '2026-09-01T10:00:00.000Z',
  }
  const fetchFalso = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace(URL_BASE, '')
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    if (path === '/api/register' || path === '/api/login') {
      return Response.json({ username: body.username, token: 'tok-123', expiresAt: '2026-10-01T10:00:00.000Z' })
    }
    if (path === '/api/data' && (!init?.method || init.method === 'GET')) {
      if (estado.revision === 0) return new Response(null, { status: 204 })
      return Response.json(estado)
    }
    if (path === '/api/data' && init?.method === 'PUT') {
      if (body.baseRevision !== estado.revision) {
        return Response.json({ error: 'conflict', ...estado }, { status: 409 })
      }
      estado.data = body.data
      estado.revision += 1
      return Response.json({ revision: estado.revision, updatedAt: estado.updatedAt })
    }
    return new Response(null, { status: 404 })
  })
  return { estado, fetchFalso }
}

let servidor: ReturnType<typeof servidorFalso>

beforeEach(() => {
  localStorage.clear()
  unlink()
  replaceData(datosLocales([]))
  servidor = servidorFalso()
  vi.stubGlobal('fetch', servidor.fetchFalso)
})

describe('vincular el dispositivo', () => {
  it('guarda usuario y token al registrarse', async () => {
    const r = await link(URL_BASE, 'estephano', '314159', 'register')
    expect(r.status).toBe('ok')
    expect(getSyncState()).toMatchObject({ username: 'estephano', token: 'tok-123', baseUrl: URL_BASE })
  })

  it('el PIN no queda guardado en ningún lado', async () => {
    await link(URL_BASE, 'estephano', '314159', 'register')
    expect(JSON.stringify(localStorage)).not.toContain('314159')
    expect(JSON.stringify(getSyncState())).not.toContain('314159')
  })

  it('no viaja el PIN en la URL', async () => {
    await link(URL_BASE, 'estephano', '314159', 'login')
    for (const [url] of servidor.fetchFalso.mock.calls) expect(url).not.toContain('314159')
  })

  it('no vincula si el server rechaza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'bad_credentials' }, { status: 401 })))
    const r = await link(URL_BASE, 'estephano', '999999', 'login')
    expect(r.status).toBe('bad-credentials')
    expect(getSyncState()).toBe(null)
  })

  it('desvincular borra el token pero NO los datos', async () => {
    replaceData(datosLocales([gasto('t1', 1250)]))
    await link(URL_BASE, 'estephano', '314159', 'register')
    unlink()
    expect(getSyncState()).toBe(null)
    expect(getData().transactions).toHaveLength(1)
  })
})

describe('la sincronización no toca el respaldo', () => {
  it('el token no entra en los datos ni en lo que se exporta', async () => {
    await link(URL_BASE, 'estephano', '314159', 'register')
    expect(JSON.stringify(toBackup(getData()))).not.toContain('tok-123')
    expect('token' in getData()).toBe(false)
  })
})

describe('subir y bajar', () => {
  it('sin vincular no hace nada', async () => {
    expect((await syncNow()).status).toBe('unlinked')
  })

  it('sube lo local cuando el server está vacío', async () => {
    replaceData(datosLocales([gasto('t1', 1250)]))
    await link(URL_BASE, 'estephano', '314159', 'register')
    const r = await syncNow()
    expect(r).toMatchObject({ status: 'ok', pushed: true })
    expect(servidor.estado.revision).toBe(1)
  })

  it('baja lo del server cuando acá no hay nada propio', async () => {
    servidor.estado.data = toBackup(datosLocales([gasto('t9', 9900)]))
    servidor.estado.revision = 3
    await link(URL_BASE, 'estephano', '314159', 'login')
    const r = await syncNow()
    expect(r).toMatchObject({ status: 'ok', pulled: true })
    expect(getData().transactions.map((t) => t.id)).toEqual(['t9'])
  })

  it('sube un cambio local posterior sin volver a bajar', async () => {
    replaceData(datosLocales([gasto('t1', 1250)]))
    await link(URL_BASE, 'estephano', '314159', 'register')
    await syncNow()
    replaceData(datosLocales([gasto('t1', 1250), gasto('t2', 500)]))
    const r = await syncNow()
    expect(r).toMatchObject({ status: 'ok', pushed: true })
    expect(servidor.estado.revision).toBe(2)
  })

  it('no sube nada si no cambió nada', async () => {
    await link(URL_BASE, 'estephano', '314159', 'register')
    await syncNow()
    const antes = servidor.estado.revision
    expect(await syncNow()).toMatchObject({ status: 'ok', pushed: false, pulled: false })
    expect(servidor.estado.revision).toBe(antes)
  })
})

describe('la app funciona sin red', () => {
  it('avisa que no hay red y deja los datos intactos', async () => {
    replaceData(datosLocales([gasto('t1', 1250)]))
    await link(URL_BASE, 'estephano', '314159', 'register')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    expect((await syncNow()).status).toBe('offline')
    expect(getData().transactions).toHaveLength(1)
    expect(getSyncState()).not.toBe(null)
  })

  it('el cambio que no se pudo subir se sube cuando vuelve la red', async () => {
    await link(URL_BASE, 'estephano', '314159', 'register')
    replaceData(datosLocales([gasto('t1', 1250)]))
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await syncNow()
    vi.stubGlobal('fetch', servidor.fetchFalso)
    expect(await syncNow()).toMatchObject({ status: 'ok', pushed: true })
    expect(servidor.estado.revision).toBe(1)
  })
})

describe('la sesión vencida', () => {
  it('desvincula y avisa, sin borrar datos', async () => {
    replaceData(datosLocales([gasto('t1', 1250)]))
    await link(URL_BASE, 'estephano', '314159', 'register')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    expect((await syncNow()).status).toBe('auth-expired')
    expect(getSyncState()).toBe(null)
    expect(getData().transactions).toHaveLength(1)
  })
})

describe('conflicto: los dos lados cambiaron', () => {
  async function conflicto() {
    replaceData(datosLocales([gasto('local', 1000)]))
    await link(URL_BASE, 'estephano', '314159', 'register')
    await syncNow()
    // Otro dispositivo sube algo mientras acá se edita.
    servidor.estado.data = toBackup(datosLocales([gasto('remoto', 7000)]))
    servidor.estado.revision = 5
    replaceData(datosLocales([gasto('local', 1000), gasto('local2', 2000)]))
    return syncNow()
  }

  it('no pisa nada y avisa', async () => {
    const r = await conflicto()
    expect(r.status).toBe('conflict')
    expect(getData().transactions.map((t) => t.id)).toEqual(['local', 'local2'])
    expect(servidor.estado.revision).toBe(5)
  })

  it('quedarse con el server reemplaza lo local', async () => {
    await conflicto()
    const r = await resolveConflict('server')
    expect(r.status).toBe('ok')
    expect(getData().transactions.map((t) => t.id)).toEqual(['remoto'])
  })

  it('quedarse con lo local pisa el server', async () => {
    await conflicto()
    const r = await resolveConflict('local')
    expect(r.status).toBe('ok')
    expect(servidor.estado.revision).toBe(6)
    expect(getData().transactions.map((t) => t.id)).toEqual(['local', 'local2'])
  })

  it('después de resolver, la siguiente sync no vuelve a dar conflicto', async () => {
    await conflicto()
    await resolveConflict('local')
    expect((await syncNow()).status).toBe('ok')
  })
})
