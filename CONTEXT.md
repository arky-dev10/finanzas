# Kumi — Finanzas personales

Glosario del dominio financiero de Kumi (app de finanzas personales Peru-first).
Solo lenguaje: las decisiones de implementación van en `docs/adr/`, la documentación técnica en `CONTEXTO.md`.

## Language

**Cuenta**:
Lugar donde vive la plata: cuenta bancaria, efectivo, o billetera con saldo propio. Es lo único que suma al Disponible.
_Avoid_: billetera (para Yape/Plin enlazados a banco), wallet

**Medio**:
Canal por el que se mueve la plata en un movimiento. Set cerrado: Yape, Plin, Tarjeta, Transferencia, Otro (Efectivo queda implícito en la cuenta Efectivo). Es un atributo opcional del movimiento, no un lugar con saldo.
_Avoid_: canal, método de pago, medios personalizados

**Yape / Plin**:
Medios, no cuentas. Un yapeo recibido entra a la cuenta bancaria enlazada (caso validado: Yape enlazado a BCP). Solo serían una Cuenta en la variante con saldo propio (Yape con DNI), no soportada aún.
_Avoid_: usar Yape como categoría o como cuenta

**Movimiento**:
Registro de plata que entró, salió o se movió en una Cuenta. Kumi conserva todos los movimientos reales; su significado financiero lo da la naturaleza, no la dirección.
_Avoid_: transacción (en UI)

**Entrada / Salida**:
Dirección de un movimiento: la plata entró o salió de una Cuenta. No implica naturaleza — «todo dinero recibido es una entrada, pero no toda entrada es un ingreso».

**Ingreso**:
Entrada que es plata nueva del usuario (sueldo, venta, honorarios). No toda entrada es ingreso.
_Avoid_: llamar ingreso a cualquier entrada

**Gasto**:
Salida que consume plata del usuario. Una salida hacia otra cuenta propia no es gasto (es transferencia).

**Devolución**:
Entrada que revierte total o parcialmente un gasto (reembolso, «yapéame tu parte», retorno de compra). Reduce el gasto de su categoría en el mes en que ocurre — nunca suma a ingresos ni reescribe meses cerrados.
_Avoid_: reembolso como categoría de ingreso

**Ajuste**:
Movimiento que calibra el saldo de una Cuenta contra la realidad: fija el saldo inicial al crearla y corrige desvíos posteriores. No es ingreso ni gasto — no toca presupuesto ni análisis.
_Avoid_: inventar un gasto o ingreso para cuadrar el saldo

**Saldo**:
Cuánta plata hay en una Cuenta en este momento, derivado de sus movimientos (ajustes incluidos). Verificable contra el banco. Una cuenta creada sin ajuste inicial queda con «saldo pendiente de configurar» y su saldo no se presenta como confiable.
_Avoid_: disponible, balance

**Ciclo mensual**:
El «mes» de Kumi: arranca el día que el usuario elige (1–28) y se etiqueta por el mes calendario en que termina — con inicio el 28, «Septiembre» va del 28 de agosto al 27 de septiembre. Con inicio 1 es el mes calendario exacto. Todo agrupado mensual (presupuesto, gastos, historial, devoluciones) usa el ciclo; los saldos de cuentas no, porque no son mensuales.
_Avoid_: mes calendario como sinónimo de mes, editar la fecha de un movimiento para «moverlo» de mes

**En cuentas**:
Total de saldos de las Cuentas calibradas del usuario. Una cuenta con saldo pendiente de configurar queda fuera de la suma — su saldo es desconocido, no cero — y el total se marca como incompleto. Es lo que muestra el Resumen mientras no existan compromisos ni deuda.
_Avoid_: llamarlo Disponible, sumar cuentas sin calibrar como si valieran cero

**Disponible**:
Dinero que el usuario puede gastar sin comprometer sus próximos pagos: En cuentas + ingresos esperados pendientes − pagos pendientes del ciclo (las ocurrencias sin monto se listan pero no suman). La deuda de tarjetas se descontará cuando existan (F3). Vive en el Calendario. NO es la suma de saldos (eso es En cuentas) ni «ingresos − gastos del mes» (eso es el neto).
_Avoid_: balance (ambiguo), llamar Disponible al total en cuentas

**Recordatorio de pago**:
Pago o ingreso esperado (una vez o cada mes) con monto opcional. Marcarlo pagado nunca crea plata: solo el movimiento real la mueve — el flujo «Pagar» registra el movimiento y marca la ocurrencia. Una ocurrencia vencida se arrastra entre ciclos hasta pagarse: una deuda no desaparece al cambiar de mes.
_Avoid_: recordatorio que genera movimientos automáticos, vencidas que se esfuman al cambiar de ciclo
