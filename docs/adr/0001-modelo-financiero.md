# ADR 0001 — Modelo financiero: cuentas, medios y naturalezas

**Fecha**: 2026-08-31 · **Estado**: aceptado · **Decidido por**: Estephano (sesión de grilling)

## Contexto

La app registraba solo `expense | income` contra un pozo único de dinero. El "Balance
disponible" era `ingresos − gastos del mes`, no cuánto dinero hay. Eso hacía imposible
representar la vida financiera real en Perú: plata repartida entre banco y efectivo,
movimientos por Yape, reembolsos entre amigos ("yapéame tu parte"), y a futuro
transferencias y tarjetas de crédito. El objetivo del producto (Kumi) es responder:
*¿cuánto tengo realmente disponible y cuánto puedo gastar sin comprometer mis próximos pagos?*

## Decisión

El vocabulario canónico vive en `CONTEXT.md`. Las piezas y sus porqués:

1. **Cuenta = donde vive la plata** (BCP, Efectivo). El saldo se deriva de los
   movimientos de la cuenta. **Yape y Plin NO son cuentas**: el Yape del usuario está
   enlazado a su cuenta BCP — modelarlo como cuenta duplicaría saldos.
2. **Medio = por dónde se movió** (Yape, Plin, Tarjeta, Transferencia, Otro). Atributo
   opcional del movimiento, con default recordado por cuenta. Set cerrado, sin medios
   personalizados. La cuenta Efectivo no lo usa.
3. **Dirección ≠ naturaleza**: «todo dinero recibido es una entrada, pero no toda
   entrada es un ingreso». Naturalezas: `gasto`, `ingreso`, `devolución`, `ajuste`
   (y `transferencia` en F1c).
4. **Devolución**: entrada que resta del gasto de su categoría (usa categorías de
   gasto) **en el mes en que ocurre** — nunca infla ingresos, nunca reescribe meses
   cerrados. Sin vínculo obligatorio al gasto original.
5. **Ajuste**: movimiento que calibra el saldo de una cuenta con la realidad (saldo
   inicial y recalibraciones). Invisible para presupuesto y análisis. Nunca se
   inventa un gasto/ingreso para cuadrar. Cuenta sin ajuste inicial = «saldo
   pendiente de configurar», saldo no confiable.
6. **Montos en céntimos enteros** (`amountCents`): las comparaciones de presupuesto y
   la futura división en cuotas exigen aritmética exacta.
7. **El Resumen muestra "En cuentas"** (total de saldos). La palabra **Disponible queda
   reservada** hasta que pueda descontar compromisos y deuda (tarjetas, calendario):
   estrenarla hoy obligaría a cambiarle el significado después.
8. **Migración**: los movimientos históricos (pre-cuentas) se asignan todos a BCP,
   editables individualmente. El ajuste inicial absorbe cualquier diferencia de saldo,
   como una conciliación bancaria.

## Alternativas descartadas

- *Yape como cuenta separada*: duplica el saldo del banco enlazado (solo valdría para
  Yape con DNI, no soportado aún).
- *Devolución como ingreso con categoría "Reembolsos"*: infla ingresos y miente en el
  presupuesto de la categoría real.
- *Devolución vinculada al gasto original con efecto retroactivo*: reescribe meses
  cerrados y exige un buscador de gastos en cada registro.
- *Saldo inicial como campo de la cuenta*: pierde el historial de recalibraciones; el
  ajuste-como-movimiento deja rastro honesto y absorbe la historia pre-cuentas.
- *Llamar "Disponible" al total de saldos ya*: en F3 cambiaría de significado bajo el
  mismo nombre.

## Consecuencias

- `BACKUP_VERSION` sube (migración: `amount`→céntimos, `type`→naturaleza, `accountId`
  a BCP; respaldos v1/v2 se siguen importando).
- Los selectores de análisis dejan de mirar `type` y pasan a interpretar naturaleza
  (gasto neto = gastos − devoluciones; ajustes invisibles).
- Registrar pasa a 3 chips (Gasto | Ingreso | Devolución); transferencias llegan en
  F1c tras probar el piloto con flujo Yape real.
