# ADR 0002 — Ciclo mensual configurable

**Fecha**: 2026-09-02 · **Estado**: aceptado · **Decidido por**: Estephano

## Contexto

El usuario cobra el 28 y gasta ese sueldo los últimos días del mes calendario. Registró
sus gastos del 28–31 de agosto y, al llegar septiembre, el Resumen "se vació": la app
agrupaba todo por mes calendario, así que el gasto de su mes real de septiembre quedó
contabilizado en agosto. El problema es estructural y se repite cada mes: **la fecha en
que ocurre un movimiento y el mes al que pertenece son cosas distintas** (el mismo tipo
de distinción que dirección ≠ naturaleza en ADR 0001).

## Decisión

Un **día de inicio de mes** global y configurable (`monthStartDay`, 1–28, en Ajustes):

1. El ciclo etiquetado «M» va del `monthStartDay` del mes M−1 al día `monthStartDay − 1`
   del mes M, y **se etiqueta por el mes en que termina** — es el mes cuyo sueldo se
   gasta. Con inicio 28: «Septiembre» = 28 ago – 27 sep.
2. `monthStartDay = 1` (el default) es **identidad exacta** con el mes calendario:
   ningún usuario existente cambia de comportamiento sin elegirlo.
3. Todo agrupado mensual usa el ciclo: Resumen, presupuesto global y por categoría,
   historial, gráficos, detalle de categoría, y el «mes en que ocurre» de una
   devolución. Los saldos de cuentas no se tocan: no son mensuales.
4. El nombre visible no cambia («Septiembre 2026»); cuando el inicio ≠ 1 se muestra el
   rango como sublabel discreto para que el límite nunca sea un misterio.
5. **La fecha de un movimiento jamás se edita para cambiarlo de mes**: la fecha dice
   cuándo ocurrió; el ciclo decide a qué mes pertenece.
6. Tope 28: los días 29–31 no existen en todos los meses (febrero) y un ciclo que a
   veces salta de día genera exactamente la confusión que esto viene a resolver.

## Alternativas descartadas

- **Editar las fechas de los movimientos**: arregla una vez, falsifica cuándo ocurrió
  la plata, rompe la conciliación futura con estados de cuenta importados (F5), y el
  problema vuelve cada mes.
- **Asignación de mes por movimiento** (`period` opcional): máxima precisión, pero
  agrega fricción a cada registro y depende de acordarse — olvidarse reintroduce el
  bug. Queda compatible como refinamiento futuro si aparece el caso de uso real.

## Consecuencias

- `Data.monthStartDay` viaja en el respaldo como campo aditivo con default 1; un
  dispositivo con app vieja que sincronice lo ignora y ve meses calendario hasta
  actualizar (sin pérdida de datos).
- Los selectores mensuales agrupan con `monthKeyFor(fecha, inicio)` en vez del prefijo
  del string de fecha.
- El «mes actual» de la navegación es el ciclo de hoy: el 2 de septiembre con inicio 28
  estás en «Septiembre» y ves los movimientos del 28–31 de agosto.
