import { parseData, toBackup, type Data } from '@/lib/backup'
import { getData, replaceData, subscribeToData } from '@/lib/store'

/*
 * Sincronización local-first: la app funciona igual sin red, y el server es un
 * lugar donde dejar una copia del respaldo para que otro dispositivo la baje.
 *
 * El estado de vinculación vive en SU PROPIA clave de localStorage, aparte de
 * los datos. Si viviera dentro de `Data`, el token de sesión terminaría dentro
 * del respaldo exportado y subido al server.
 */
const KEY = 'kumi-sync-v1'

export interface SyncState {
  baseUrl: string
  username: string
  token: string
  /** Última revisión del server que este dispositivo conoce. */
  revision: number
  /** Hay cambios locales que todavía no subieron. */
  dirty: boolean
  lastSyncAt?: string
}

export type LinkMode = 'register' | 'login'

export type LinkResult =
  | { status: 'ok'; username: string }
  | { status: 'bad-credentials' }
  | { status: 'username-taken' }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'offline' }
  | { status: 'error'; message: string }

export type SyncResult =
  | { status: 'ok'; pulled: boolean; pushed: boolean; revision: number }
  | { status: 'conflict'; serverRevision: number; serverUpdatedAt: string | null }
  | { status: 'unlinked' }
  | { status: 'auth-expired' }
  | { status: 'offline' }
  | { status: 'error'; message: string }

/* ---------- estado ---------- */

export function getSyncState(): SyncState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<SyncState>
    if (typeof s.baseUrl !== 'string' || typeof s.username !== 'string' || typeof s.token !== 'string') return null
    return { ...s, revision: Number(s.revision ?? 0), dirty: s.dirty === true } as SyncState
  } catch {
    return null
  }
}

function saveState(s: SyncState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/** Desvincula el dispositivo. NO borra los datos: son del usuario, no del server. */
export function unlink() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  conflictoPendiente = null
}

/* ---------- marcar cambios locales ---------- */

let aplicandoRemoto = false
let conflictoPendiente: { data: Data; revision: number; updatedAt: string | null } | null = null

/**
 * Cualquier cambio local deja el estado "sucio" para que la próxima sync suba.
 * Se ignora mientras estamos aplicando datos bajados, que si no se marcarían
 * como cambio propio y rebotarían al server en la sync siguiente.
 */
subscribeToData(() => {
  if (aplicandoRemoto) return
  const s = getSyncState()
  if (s && !s.dirty) saveState({ ...s, dirty: true })
})

function aplicarRemoto(blob: unknown): Data | null {
  const parsed = parseData(blob)
  if (!parsed) return null
  aplicandoRemoto = true
  try {
    // `replaceData` devuelve lo anterior: es lo que permite ofrecer "Deshacer".
    return replaceData(parsed)
  } finally {
    aplicandoRemoto = false
  }
}

/* ---------- HTTP ---------- */

const OFFLINE = { status: 'offline' } as const

function url(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

async function pedir(s: SyncState, path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url(s.baseUrl, path), {
      ...init,
      headers: { ...init?.headers, authorization: `Bearer ${s.token}` },
    })
  } catch {
    return null
  }
}

/* ---------- vincular ---------- */

/** El PIN se manda en el cuerpo del POST y no se guarda nunca. */
export async function link(
  baseUrl: string,
  username: string,
  pin: string,
  mode: LinkMode,
): Promise<LinkResult> {
  let res: Response
  try {
    res = await fetch(url(baseUrl, `/api/${mode}`), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, pin }),
    })
  } catch {
    return OFFLINE
  }

  if (res.status === 401) return { status: 'bad-credentials' }
  if (res.status === 409) return { status: 'username-taken' }
  if (res.status === 429) {
    const body = (await res.json().catch(() => ({}))) as { retryAfterSeconds?: number }
    return { status: 'locked', retryAfterSeconds: Number(body.retryAfterSeconds ?? 60) }
  }
  if (!res.ok) return { status: 'error', message: `El server respondió ${res.status}` }

  const body = (await res.json()) as { username: string; token: string }
  saveState({
    baseUrl,
    username: body.username,
    token: body.token,
    revision: 0,
    // Si acá ya hay movimientos, son un cambio a subir: sin esto, vincular un
    // dispositivo con datos contra una cuenta con datos los perdería en silencio.
    dirty: getData().transactions.length > 0,
  })
  return { status: 'ok', username: body.username }
}

/* ---------- sincronizar ---------- */

async function subir(s: SyncState, baseRevision: number): Promise<SyncResult> {
  const res = await pedir(s, '/api/data', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: toBackup(getData()), baseRevision }),
  })
  if (!res) return OFFLINE
  if (res.status === 401) {
    unlink()
    return { status: 'auth-expired' }
  }
  if (res.status === 409) {
    const body = (await res.json()) as { data: unknown; revision: number; updatedAt: string | null }
    return guardarConflicto(body)
  }
  if (!res.ok) return { status: 'error', message: `El server respondió ${res.status}` }

  const body = (await res.json()) as { revision: number; updatedAt: string }
  saveState({ ...s, revision: body.revision, dirty: false, lastSyncAt: body.updatedAt })
  return { status: 'ok', pulled: false, pushed: true, revision: body.revision }
}

function guardarConflicto(body: { data: unknown; revision: number; updatedAt: string | null }): SyncResult {
  const parsed = parseData(body.data)
  if (!parsed) return { status: 'error', message: 'El respaldo del server no se entiende' }
  conflictoPendiente = { data: parsed, revision: body.revision, updatedAt: body.updatedAt }
  return { status: 'conflict', serverRevision: body.revision, serverUpdatedAt: body.updatedAt }
}

/**
 * Una pasada de sincronización. Baja si el server está más adelante, sube si hay
 * cambios locales, y si las dos cosas pasaron a la vez no toca nada y devuelve
 * `conflict` para que decida el usuario.
 */
export async function syncNow(): Promise<SyncResult> {
  const s = getSyncState()
  if (!s) return { status: 'unlinked' }

  const res = await pedir(s, '/api/data')
  if (!res) return OFFLINE
  if (res.status === 401) {
    unlink()
    return { status: 'auth-expired' }
  }

  // 204: el server no tiene nada todavía. Lo de acá es lo único que hay.
  if (res.status === 204) return subir(s, 0)
  if (!res.ok) return { status: 'error', message: `El server respondió ${res.status}` }

  const body = (await res.json()) as { data: unknown; revision: number; updatedAt: string }

  if (body.revision > s.revision) {
    if (s.dirty) return guardarConflicto({ ...body, updatedAt: body.updatedAt })
    if (!aplicarRemoto(body.data)) return { status: 'error', message: 'El respaldo del server no se entiende' }
    saveState({ ...s, revision: body.revision, dirty: false, lastSyncAt: body.updatedAt })
    return { status: 'ok', pulled: true, pushed: false, revision: body.revision }
  }

  if (s.dirty) return subir(s, body.revision)
  return { status: 'ok', pulled: false, pushed: false, revision: s.revision }
}

/** Qué hacer con el conflicto que dejó la última sync. */
export async function resolveConflict(quedarse: 'server' | 'local'): Promise<SyncResult> {
  const s = getSyncState()
  const pendiente = conflictoPendiente
  if (!s) return { status: 'unlinked' }
  if (!pendiente) return { status: 'error', message: 'No hay ningún conflicto que resolver' }

  if (quedarse === 'server') {
    aplicandoRemoto = true
    try {
      replaceData(pendiente.data)
    } finally {
      aplicandoRemoto = false
    }
    saveState({ ...s, revision: pendiente.revision, dirty: false, lastSyncAt: pendiente.updatedAt ?? undefined })
    conflictoPendiente = null
    return { status: 'ok', pulled: true, pushed: false, revision: pendiente.revision }
  }

  // Quedarse con lo local: subimos contra la revisión del server, que es lo que
  // convierte el push en un pisado deliberado y no en una carrera.
  const r = await subir({ ...s, revision: pendiente.revision }, pendiente.revision)
  if (r.status === 'ok') conflictoPendiente = null
  return r
}

/** Los datos del server que quedaron esperando decisión, para mostrarlos. */
export function pendingConflict(): { revision: number; updatedAt: string | null } | null {
  return conflictoPendiente && { revision: conflictoPendiente.revision, updatedAt: conflictoPendiente.updatedAt }
}
