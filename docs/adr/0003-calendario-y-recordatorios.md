# ADR 0003 — Calendario financiero, recordatorios y el estreno de «Disponible»

**Fecha**: 2026-09-02 · **Estado**: aceptado · **Decidido por**: Estephano

## Contexto

El usuario pidió un calendario y recordatorios de pagos, y una barra de navegación «más
pensada». El doc de producto (§8) ya fijaba el carácter: **no un calendario genérico**,
sino la pantalla del futuro — pagos esperados, ingresos esperados y proyección. Con
compromisos registrables por fin puede estrenarse la palabra «Disponible», reservada
desde la decisión D7 para cuando pudiera significar lo que promete.

## Decisión

1. **Tríada temporal**: Historial = pasado, Resumen = presente, Calendario = futuro.
   En la barra, Calendario toma el lugar del tab Categorías (elección explícita del
   usuario entre tres propuestas); el FAB flotante conserva su semántica única en toda
   la app: registrar movimientos.
2. **Recordatorio**: pago o ingreso esperado, una vez o mensual, monto opcional.
   Nunca genera movimientos solo: el flujo «Pagar» lleva a Registrar prellenado y al
   guardar marca la ocurrencia — la plata solo la mueve un movimiento real. Las
   vencidas se arrastran entre ciclos hasta pagarse.
3. **Disponible** = En cuentas + ingresos esperados pendientes − pagos pendientes del
   ciclo (vencidas arrastradas incluidas). Las ocurrencias sin monto se listan pero no
   suman: no inventamos números. La deuda de tarjeta se descontará en F3.
4. **Resumen como hub**: cada bloque del Resumen es la puerta a su mundo — «En
   cuentas» → Cuentas, «Gastos del mes» → Categorías, «Próximos pagos» → Calendario,
   «Lo último» → Historial. Categorías deja de ser tab (vive en Ajustes y en las filas
   de cada pantalla); su gestión queda a un tap del home por el hub.
5. **Avisos dentro de la app** en v1 (calendario, Resumen y punto en el tab): una PWA
   no puede programar notificaciones sin servidor; Web Push llegará cuando el backend
   esté deployado.

## Alternativas descartadas

- Barra de 5 tabs o FAB central: el usuario eligió el cambio mínimo (4 tabs, FAB igual).
- Recordatorios que crean movimientos automáticamente: registrar plata que quizá no se
  movió rompe la verdad del historial y la conciliación futura (F5).
- Push inmediato: encadenaba la feature al deploy del backend, aún sin destino.

## Consecuencias

- `Data.reminders` viaja en el respaldo como campo aditivo (default `[]`, sin bump —
  precedente `monthStartDay`). Un dispositivo con app vieja que sincronice el blob
  perdería los recordatorios: actualizar todos los dispositivos antes de vincular
  (teórico hasta que el backend se deploye).
- La proyección introduce el primer número «hacia adelante» de la app; cuando lleguen
  tarjetas (F3) y recurrencias detectadas (F6), alimentan el mismo bloque.
