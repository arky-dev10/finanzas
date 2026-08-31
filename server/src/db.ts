import { DatabaseSync } from 'node:sqlite'

/**
 * Una sola tabla por cosa y nada de ORM: el server guarda cuatro cosas y todas
 * las consultas son por clave primaria.
 *
 * `vaults.data` es el respaldo del cliente TAL CUAL, como texto opaco. El
 * server no entiende el modelo financiero a propósito: así el modelo puede
 * cambiar (y cambió cuatro veces ya) sin redeployar el server.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  username        TEXT PRIMARY KEY,
  pin_hash        TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(username);

CREATE TABLE IF NOT EXISTS vaults (
  username   TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  revision   INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- Rate limit por IP, aparte del contador por usuario: sin esto, rotar usuarios
-- esquiva el bloqueo.
CREATE TABLE IF NOT EXISTS ip_attempts (
  ip              TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER
);
`

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path)
  // WAL para que una lectura no espere a una escritura; foreign_keys para que
  // borrar un usuario se lleve sus sesiones y su vault.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

export type Db = DatabaseSync
