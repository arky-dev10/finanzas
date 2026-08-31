# kumi-server

Servidor de vinculación de Kumi: guarda una copia del respaldo del usuario para
que otro dispositivo la baje. Un proceso, una base SQLite, sin build.

```bash
npm install
npm test          # vitest
npm run dev       # node --watch, escucha en :8787
npm start
```

| Variable | Default | Para qué |
|---|---|---|
| `PORT` | `8787` | Puerto |
| `DB_PATH` | `./data/kumi.db` | Archivo SQLite. En Docker apunta al volumen `/data` |
| `ALLOWED_ORIGIN` | `*` | Origen permitido por CORS. En producción, la URL de la PWA |
| `TRUST_PROXY` | apagado | Encenderlo **solo** detrás de un proxy propio (ver abajo) |

```bash
docker build -t kumi-server .
docker run -p 8787:8787 -v kumi-data:/data \
  -e ALLOWED_ORIGIN=https://kumi.example -e TRUST_PROXY=1 kumi-server
```

## API

| | | |
|---|---|---|
| `POST` | `/api/register` | `{username, pin}` → `201 {username, token, expiresAt}` |
| `POST` | `/api/login` | `{username, pin}` → `200 {username, token, expiresAt}` |
| `POST` | `/api/logout` | Bearer → `204`, invalida ese token |
| `GET` | `/api/data` | Bearer → `200 {data, revision, updatedAt}` · `204` si nunca subió |
| `PUT` | `/api/data` | Bearer + `{data, baseRevision}` → `200 {revision, updatedAt}` · `409` con lo del server |
| `GET` | `/api/health` | `{ok: true}` |

**Conflictos**: el cliente manda de qué revisión partió. Si el server ya avanzó,
subió otro dispositivo en el medio: el server responde `409` con su versión y no
pisa nada. Quién gana lo decide el usuario en la app, no el server.

**El blob es opaco.** El server guarda el respaldo como texto y solo comprueba
que tenga `version` y los tres arrays. No entiende el modelo financiero a
propósito: el modelo ya cambió cuatro veces, y un server que lo validara
necesitaría un deploy por cada cambio para no rechazar a los clientes nuevos.
Un respaldo con campos que todavía no existen pasa y vuelve intacto.

## Seguridad, y qué NO cubre

El PIN es de 6 dígitos por pedido del usuario. Son **10^6 combinaciones**: sin
freno se agotan en minutos. Lo que compensa:

- **argon2id** para el PIN guardado (fijado por un test sobre el hash real, no
  por una línea de config), con sal por usuario.
- **Bloqueo progresivo por usuario Y por IP.** Dos errores gratis; del tercero en
  adelante 15s, 30s, 60s… hasta un techo de 30 minutos. A ese ritmo son **48
  intentos por día: recorrer medio espacio de PINs lleva ~57 años**. El contador
  por IP existe para que rotar usuarios no esquive el bloqueo.
- **Respuesta indistinguible** entre PIN equivocado y usuario inexistente,
  incluido el tiempo: cuando el usuario no existe se verifica igual contra un
  hash de descarte, para que no se pueda enumerar quién está registrado.
- **Tokens** de 32 bytes aleatorios, guardados hasheados (SHA-256), 30 días de
  vigencia. El PIN nunca viaja en una URL ni se escribe en logs.

Lo que **no** cubre, y conviene saber antes de confiarle plata:

1. **El PIN se sostiene por el bloqueo, no por el PIN.** Si algún día se
   deshabilita el rate-limiting, 10^6 se agota en minutos.
2. **No hay recuperación de cuenta.** Sin mail ni segundo factor, olvidar el PIN
   es perder el acceso al vault remoto. Los datos locales del dispositivo siguen
   intactos: la app es local-first y funciona sin server.
3. **No hay cifrado extremo a extremo.** Quien controle el server ve los
   movimientos en claro. Para v1 el server es de confianza; si eso cambia, hay
   que cifrar en el cliente antes de subir.
4. **`TRUST_PROXY` mal puesto rompe el límite por IP.** Encendido sin un proxy
   propio adelante, cualquiera manda un `x-forwarded-for` inventado y estrena
   contador en cada intento. Apagado, todos comparten una sola clave y un
   usuario torpe puede frenar a los demás. Encenderlo solo detrás de un proxy
   que reescriba el header.
5. **Registro revela si un usuario existe** (`409`). No hay forma de que alguien
   elija su nombre sin saberlo; lo frena el mismo límite por IP.
