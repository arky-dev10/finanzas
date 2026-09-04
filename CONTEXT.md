# Kumi — Finanzas personales

Glosario del dominio financiero de Kumi (app de finanzas personales Peru-first).
Solo lenguaje: las decisiones de implementación van en `docs/adr/`, la documentación técnica en `CONTEXTO.md`.

## Language

**Cuenta**:
Lugar donde vive la plata: cuenta bancaria, efectivo, o billetera con saldo propio. Una tarjeta de crédito también es una Cuenta, pero de las que guardan deuda en vez de plata: su saldo es negativo por naturaleza y NO suma al Disponible.
_Avoid_: billetera (para Yape/Plin enlazados a banco), wallet

**Tarjeta**:
Llave para llegar a una Cuenta, no un lugar donde vive la plata. La de débito abre una cuenta bancaria y no tiene saldo propio — el saldo es el de la cuenta. La de crédito abre su propia cuenta de deuda. El usuario la reconoce por marca y últimos cuatro dígitos; Kumi nunca guarda el número completo.
_Avoid_: tarjeta como sinónimo de cuenta, tarjeta de débito con saldo propio

**Medio**:
Canal por el que se mueve la plata en un movimiento. Set cerrado: Yape, Plin, Tarjeta, Transferencia, Otro (Efectivo queda implícito en la cuenta Efectivo). Es un atributo opcional del movimiento, no un lugar con saldo.
_Avoid_: canal, método de pago, medios personalizados

**Yape / Plin**:
Medios, no cuentas. Cada uno declara de qué Cuenta sale y entra su plata — y el usuario puede decirlo nombrando su tarjeta de débito, que es como lo piensa. Solo serían una Cuenta en la variante con saldo propio (Yape con DNI), no soportada aún.
_Avoid_: usar Yape como categoría o como cuenta, dejar el origen a la adivinanza cuando hay dos bancos

**Movimiento**:
Registro de plata que entró, salió o se movió en una Cuenta. Kumi conserva todos los movimientos reales; su significado financiero lo da la naturaleza, no la dirección.
_Avoid_: transacción (en UI)

**Entrada / Salida**:
Dirección de un movimiento: la plata entró o salió de una Cuenta. No implica naturaleza — «todo dinero recibido es una entrada, pero no toda entrada es un ingreso».

**Ingreso**:
Entrada que es plata nueva del usuario (sueldo, venta, honorarios). No toda entrada es ingreso.
_Avoid_: llamar ingreso a cualquier entrada

**Gasto**:
Salida que consume plata del usuario. Cuenta el día en que se compra, no el día en que se paga: un consumo con tarjeta de crédito es gasto desde que ocurre. Una salida hacia otra cuenta propia no es gasto (es transferencia).
_Avoid_: contar el gasto recién al pagar el estado de cuenta

**Devolución**:
Entrada que revierte total o parcialmente un gasto (reembolso, «yapéame tu parte», retorno de compra). Reduce el gasto de su categoría en el mes en que ocurre — nunca suma a ingresos ni reescribe meses cerrados.
_Avoid_: reembolso como categoría de ingreso

**Transferencia**:
Movimiento entre dos Cuentas propias: sale de una, entra a la otra. No es gasto ni ingreso — no toca presupuesto ni categorías. Es lo que son el retiro de cajero, el pase de un banco a otro y el pago de una tarjeta de crédito.
_Avoid_: registrar el pago de la tarjeta como gasto (ya se contó al comprar), inventar un gasto y un ingreso para mover plata propia

**Ajuste**:
Movimiento que calibra el saldo de una Cuenta contra la realidad: fija el saldo inicial al crearla y corrige desvíos posteriores. No es ingreso ni gasto — no toca presupuesto ni análisis.
_Avoid_: inventar un gasto o ingreso para cuadrar el saldo

**Saldo**:
Cuánta plata hay en una Cuenta en este momento, derivado de sus movimientos (ajustes incluidos). Verificable contra el banco. Una cuenta creada sin ajuste inicial queda con «saldo pendiente de configurar» y su saldo no se presenta como confiable.
_Avoid_: disponible, balance

**Deuda**:
Lo que el usuario le debe a una tarjeta de crédito: el saldo de su Cuenta, en positivo. Nunca entra a «En cuentas» — no es plata suya. Se parte en lo ya facturado (que vence en una fecha) y el consumo en curso (que se factura al próximo cierre).
_Avoid_: saldo (para tarjetas de crédito), mezclar deuda con plata disponible

**Línea**:
Cuánto crédito aprobó el banco en una tarjeta. Lo que queda sin usar (línea − deuda) es plata del banco, no del usuario: se muestra como dato de la tarjeta y jamás suma al Disponible.
_Avoid_: llamar disponible a la línea libre, sumar la línea al dinero del usuario

**Ciclo de tarjeta**:
El mes propio de cada tarjeta de crédito, fijado por el banco: cierra un día (facturación) y vence otro (pago). Es independiente del Ciclo mensual del usuario, y no tienen por qué coincidir — una compra puede caer en el septiembre del usuario y a la vez en el estado de cuenta que cierra en octubre.
_Avoid_: forzar el ciclo de la tarjeta al ciclo del usuario, un solo ciclo para todas las tarjetas

**Estado de cuenta**:
Lo facturado por una tarjeta al cerrar su ciclo: el monto que el banco va a cobrar y la fecha en que vence. Kumi lo estima mientras el período está abierto y lo marca como estimado; cuando llega el real, el usuario lo declara y Kumi anota la diferencia como cargos del banco (membresía, ITF, desgravamen, intereses).
_Avoid_: presentar la estimación de Kumi como si fuera el monto del banco, inventar los cargos que faltan

**Cuota**:
Cada una de las partes en que se paga una compra con tarjeta de crédito. La compra sigue siendo UN movimiento con su plan pegado: la deuda es el total desde el día uno, pero el presupuesto del mes solo siente la cuota que toca.
_Avoid_: crear un movimiento por cuota, cargar la compra entera al presupuesto del mes

**Ciclo mensual**:
El «mes» de Kumi: arranca el día que el usuario elige (1–28) y se etiqueta por el mes calendario en que termina — con inicio el 28, «Septiembre» va del 28 de agosto al 27 de septiembre. Con inicio 1 es el mes calendario exacto. Todo agrupado mensual (presupuesto, gastos, historial, devoluciones) usa el ciclo; los saldos de cuentas no, porque no son mensuales.
_Avoid_: mes calendario como sinónimo de mes, editar la fecha de un movimiento para «moverlo» de mes

**En cuentas**:
Total de saldos de las Cuentas calibradas del usuario, sin las tarjetas de crédito: es la plata que tiene, no la que debe. Una cuenta con saldo pendiente de configurar queda fuera de la suma — su saldo es desconocido, no cero — y el total se marca como incompleto.
_Avoid_: llamarlo Disponible, sumar cuentas sin calibrar como si valieran cero, sumar tarjetas de crédito

**Disponible**:
Dinero que el usuario puede gastar sin comprometer sus próximos pagos: En cuentas + ingresos esperados pendientes − pagos pendientes del ciclo (las ocurrencias sin monto se listan pero no suman). Lo facturado de una tarjeta entra por ahí, porque la tarjeta genera su propio pago pendiente; el consumo en curso no, porque se cobra el ciclo siguiente. Vive en el Calendario. NO es la suma de saldos (eso es En cuentas) ni «ingresos − gastos del mes» (eso es el neto).
_Avoid_: balance (ambiguo), llamar Disponible al total en cuentas, descontar deuda que todavía no vence

**Recordatorio de pago**:
Pago o ingreso esperado (una vez o cada mes) con monto opcional. Marcarlo pagado nunca crea plata: solo el movimiento real la mueve — el flujo «Pagar» registra el movimiento y marca la ocurrencia. Una ocurrencia vencida se arrastra entre ciclos hasta pagarse: una deuda no desaparece al cambiar de mes.
_Avoid_: recordatorio que genera movimientos automáticos, vencidas que se esfuman al cambiar de ciclo
