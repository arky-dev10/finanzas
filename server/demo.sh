#!/usr/bin/env bash
# Demo del flujo completo contra un server real y una base descartable.
# Uso: bash demo.sh
set -euo pipefail

PORT="${PORT:-8788}"
BASE="http://127.0.0.1:$PORT"
TMP="$(mktemp -d)"
trap 'kill "${SRV:-}" 2>/dev/null || true; rm -rf "$TMP"' EXIT

jsonget() { python3 -c "import json,sys;print(json.load(sys.stdin).get('$1',''))"; }
titulo() { printf '\n\033[1m── %s\033[0m\n' "$1"; }

DB_PATH="$TMP/kumi.db" PORT="$PORT" TRUST_PROXY=1 node src/index.ts >"$TMP/log" 2>&1 &
SRV=$!
for _ in $(seq 50); do curl -sf "$BASE/api/health" >/dev/null 2>&1 && break; sleep 0.1; done
echo "server arriba en $BASE (db descartable en $TMP)"

RESPALDO='{"version":4,"exportedAt":"2026-09-01T10:00:00.000Z","monthlyBudgetCents":350000,
  "accounts":[{"id":"a_bcp","name":"BCP","kind":"bank"}],
  "categories":[{"id":"c_food","name":"Comida","icon":"utensils","color":"#eb6834","type":"expense"}],
  "transactions":[{"id":"t1","amountCents":1250,"nature":"expense","accountId":"a_bcp","categoryId":"c_food","date":"2026-09-01","note":"CELULAR"}]}'

titulo "1. register — crea la cuenta y vincula el celular"
CEL=$(curl -s -X POST "$BASE/api/register" -H 'content-type: application/json' \
  -d '{"username":"estephano","pin":"314159"}' | tee /dev/stderr | jsonget token)

titulo "2. login desde la tablet — mismo usuario, token distinto"
TAB=$(curl -s -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -d '{"username":"estephano","pin":"314159"}' | tee /dev/stderr | jsonget token)

titulo "3. GET /api/data en una cuenta nueva — 204, no hay nada todavía"
curl -s -o /dev/null -w 'HTTP %{http_code}\n' "$BASE/api/data" -H "authorization: Bearer $CEL"

titulo "4. PUT desde el celular, baseRevision 0"
curl -s -X PUT "$BASE/api/data" -H "authorization: Bearer $CEL" -H 'content-type: application/json' \
  -d "{\"data\":$RESPALDO,\"baseRevision\":0}"; echo

titulo "5. GET desde la tablet — se baja lo que subió el celular"
curl -s "$BASE/api/data" -H "authorization: Bearer $TAB" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('revision',d['revision'],'· nota:',d['data']['transactions'][0]['note'])"

titulo "6. CONFLICTO — la tablet subía desde la revisión 0, sin saber del celular"
curl -s -o "$TMP/conf" -w 'HTTP %{http_code}\n' -X PUT "$BASE/api/data" \
  -H "authorization: Bearer $TAB" -H 'content-type: application/json' \
  -d "{\"data\":${RESPALDO//CELULAR/TABLET},\"baseRevision\":0}"
python3 -c "import json;d=json.load(open('$TMP/conf'));print('  error:',d['error'],'· el server sigue en revision',d['revision'],'y devuelve su nota:',d['data']['transactions'][0]['note'])"

titulo "7. la tablet se pone al día y ahí sí sube"
curl -s -X PUT "$BASE/api/data" -H "authorization: Bearer $TAB" -H 'content-type: application/json' \
  -d "{\"data\":${RESPALDO//CELULAR/TABLET-AL-DIA},\"baseRevision\":1}"; echo
curl -s "$BASE/api/data" -H "authorization: Bearer $CEL" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('  el celular ahora ve:',d['data']['transactions'][0]['note'],'en revision',d['revision'])"

titulo "8. PIN equivocado — dos libres y al tercero bloquea"
for i in 1 2 3; do
  printf '  intento %s: ' "$i"
  curl -s -o "$TMP/r" -w 'HTTP %{http_code}' -X POST "$BASE/api/login" \
    -H 'content-type: application/json' -d '{"username":"estephano","pin":"000000"}'
  printf ' %s\n' "$(python3 -c "import json;d=json.load(open('$TMP/r'));print(d.get('error'), ('· esperar '+str(d['retryAfterSeconds'])+'s') if 'retryAfterSeconds' in d else '')")"
done

titulo "9. ni con el PIN correcto se entra mientras dura el bloqueo"
curl -s -o /dev/null -w '  HTTP %{http_code} (429 = bloqueado)\n' -X POST "$BASE/api/login" \
  -H 'content-type: application/json' -d '{"username":"estephano","pin":"314159"}'

titulo "10. usuario inexistente — misma respuesta, no se puede enumerar"
curl -s -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -H 'x-forwarded-for: 203.0.113.9' -d '{"username":"fantasma","pin":"314159"}'; echo

titulo "11. el PIN nunca aparece en los logs del server"
if grep -q '314159' "$TMP/log"; then echo "  ✗ APARECE"; exit 1; else echo "  ✓ no aparece"; fi
