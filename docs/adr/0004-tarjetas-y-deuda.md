# ADR 0004 — Tarjetas, deuda y cuotas

**Fecha**: 2026-09-04 · **Estado**: aceptado · **Decidido por**: Estephano (sesión de grilling)

## Contexto

El usuario pidió «poder elegir y configurar mis tarjetas, de crédito de débito, cuánto
tengo, y poder así registrando los gastos ir avanzando», más «cada tarjeta de crédito
debe tener su ciclo», «registrar mis pagos mensuales como luz, comida, pasajes
aprovechando las categorías pero con un calendario» y «cuántas cuotas me faltan y
cuántas voy».

Esto es el F3 que los ADR 0001 y 0003 venían anticipando: el 0001 reservó la palabra
**Disponible** «hasta que pueda descontar compromisos y deuda (tarjetas, calendario)» y
el 0003 dejó escrito que «la deuda de tarjeta se descontará en F3».

El estado real del código antes de este ADR:

- `Account` solo conoce `bank | cash`. **No existe `addAccount`**: las únicas cuentas
  posibles son las dos sembradas (BCP, Efectivo). El usuario nunca pudo cargar su
  billetera real.
- «Tarjeta» existe solo como `Medium = 'card'`: dice por dónde se movió la plata, no
  cuál tarjeta, con qué línea ni cuándo vence.
- Las transferencias (F1c del ADR 0001) **no se construyeron**. Consecuencia hasta hoy
  invisible: un **retiro de cajero** no tiene representación honesta — la plata sale de
  BCP y entra a Efectivo, y eso no es gasto, ni ingreso, ni un ajuste (que es una
  calibración, no un movimiento).
- El calendario y los recordatorios del ADR 0003 están **aceptados pero sin implementar**.

## Decisión

### D1 — Débito y crédito no son la misma clase de cosa

**Tarjeta = llave, no lugar donde vive la plata.** La de débito abre una cuenta bancaria
que ya existe: no tiene saldo propio, porque el saldo es el de la cuenta. Modelarla como
cuenta duplicaría la plata del banco — exactamente el error que el ADR 0001 evitó con
Yape.

La de crédito no contiene plata del usuario: contiene **deuda**. Es una cuenta
`kind: 'credit'` cuyo saldo es negativo por naturaleza, con **línea** y **disponible de
línea** propios. Su "disponible" es dinero del banco, no del usuario, y por eso nunca se
mezcla con el suyo.

**«En cuentas» suma `bank` + `cash` y nunca `credit`.** La deuda se presenta aparte.

### D2 — El gasto cuenta el día que comprás (devengado)

Un consumo con tarjeta de crédito entra como gasto **el día de la compra**, con su
categoría y su fecha real. Pagar el estado de cuenta **no es un gasto**: ese gasto ya se
contó. El pago es plata que se mueve de una cuenta a la deuda — una **transferencia**.

Contarlo al pagar convertiría todo el consumo del mes en un solo bloque «Pago tarjeta
S/ 1,250» sin categoría, y la app dejaría de responder *¿en qué se me está yendo?*, que
es su pregunta #2 (`CONTEXTO.md`).

Costo aceptado: los «gastos del mes» incluyen cosas que todavía no se pagaron. Para eso
está el número de deuda.

### D3 — Cada tarjeta de crédito tiene su propio ciclo

Cierre (facturación) y pago son días del mes propios de cada tarjeta, fijados por el
banco. Kumi pasa a tener **tres relojes** y está bien que no coincidan:

| Reloj | Quién lo fija | Para qué |
|---|---|---|
| Ciclo personal (`monthStartDay`, global) | el usuario | En qué mes cae un gasto: presupuesto, categorías, historial |
| Ciclo de cada tarjeta (`closingDay`, `dueDay`) | el banco | Qué consumos entran a qué estado de cuenta y cuándo vencen |
| Mes calendario | nadie | Solo etiquetas |

Una compra del 3 de septiembre puede caer en el septiembre del usuario para el
presupuesto **y** en el estado de cuenta que cierra el 5 de octubre para la deuda. Las
dos cosas son ciertas a la vez.

`closingDay` y `dueDay` aceptan **1–31**, no 1–28 como `monthStartDay`. Son datos reales
del banco (hay tarjetas que cierran el 30) y forzar 28 metería un error sistemático de
días en el número protagonista. El día se acota al último del mes al calcularlo
(30 de febrero → 28/29), no al guardarlo.

### D4 — El número protagonista de una tarjeta es «por pagar y cuándo»

Manda el estado de cuenta cerrado: **«Por pagar S/ 1,283.50 · vence el 22»**. Es lo único
accionable — la plata que el banco va a cobrar sí o sí este ciclo. La deuda total y el
consumo del período en curso quedan visibles, en segundo plano.

Encaja con el Calendario del ADR 0003 sin cambiar su fórmula: la tarjeta **genera su
propio pago pendiente** y el Disponible lo descuenta por esa vía, no por una regla nueva.

### D5 — Kumi estima, el usuario confirma (conciliación)

Kumi **nunca cuadra sola** con el banco: el estado de cuenta trae membresía, ITF, seguro
de desgravamen, intereses y el recargo de las cuotas con interés. Como «por pagar» es el
número protagonista, un número casi siempre un poco mal destruye la confianza más rápido
que uno vacío.

Mientras el período está abierto Kumi muestra su cálculo marcado como **estimado (`≈`)**.
Al cerrar, el usuario declara el monto real y Kumi anota la diferencia como **cargos del
banco**. Es el mismo gesto —y el mismo principio— que el «Ajustar saldo» del ADR 0001:
la realidad la declara el usuario, la app anota el delta y no inventa un gasto.

### D6 — Cuotas: un movimiento con su plan

Una compra en cuotas es **un solo movimiento** en el historial (monto total, fecha real,
categoría, tarjeta) con su plan pegado: `installments: { count, paid }`.

- La **deuda** es el total desde el día uno: eso es lo que se debe.
- El **presupuesto del mes** siente solo la cuota que toca.
- El progreso «vas 3 de 12» sale del plan.

Sin esto, una refrigeradora de S/ 1,200 en 12 cuotas marca 300% de un presupuesto de
S/ 400 y la alerta del 90% miente once meses seguidos.

### D7 — Transferencia completa entre cuentas (el F1c pendiente)

Naturaleza `transfer`: sale de una cuenta, entra a otra, no es gasto ni ingreso, no toca
presupuesto ni categorías. Un solo mecanismo cubre pagar la tarjeta, el retiro de cajero,
BCP → Interbank y el pase a ahorros.

### D8 — «Disponible» se estrena, descontando lo que vence en este ciclo

Se levanta la reserva de la D7 del ADR 0001. **Disponible = En cuentas + ingresos
esperados pendientes − compromisos que vencen en este ciclo** (lo facturado de las
tarjetas incluido, por la vía del calendario).

El **consumo en curso** de la tarjeta queda **fuera**: se cobra el ciclo siguiente y se
descontará cuando cierre. Descontarlo hoy castigaría por adelantado algo que se paga en
siete semanas, y haría que cada café con tarjeta bajara el Disponible al instante.

La deuda total sigue visible, aparte, para que «lo que debo» no desaparezca detrás de
«lo que puedo gastar».

### D9 — Yape y Plin con origen configurable

Dejan de ser un medio anónimo. El usuario declara *«este Yape es de esta tarjeta de
débito»* y al elegir Yape en Registrar, Kumi ya sabe de qué cuenta sale la plata. El
ADR 0001 decía que un yapeo entra a «la cuenta enlazada» pero no dejaba elegir cuál —
con dos bancos, eso era adivinar.

## Modelo

```ts
type AccountKind = 'bank' | 'cash' | 'credit'

interface Account {          // dónde vive la plata (o dónde vive la deuda)
  kind: AccountKind
  issuer?: string            // emisor peruano, catálogo abierto
  creditLimitCents?: number  // solo credit: la línea
  closingDay?: number        // solo credit: día de cierre (1–31)
  dueDay?: number            // solo credit: día de pago (1–31)
}

interface Card {             // identidad: cómo la reconoce el usuario
  kind: 'debit' | 'credit'
  accountId: string          // débito → una cuenta bank | crédito → su cuenta credit
  brand?: CardBrand
  last4?: string             // últimos 4, nunca el número completo
}

interface Wallet {           // Yape / Plin
  provider: 'yape' | 'plin'
  accountId: string          // la verdad: de dónde sale la plata
  cardId?: string            // la etiqueta: qué plástico, si el usuario lo dijo
}
```

**Toda tarjeta es un `Card`, también la de crédito**, contra lo que se pensó al principio
de la sesión (la de crédito «es» su cuenta, sin fila propia). Se cambió al escribir este
ADR: marca, últimos 4 y emisor identifican a una tarjeta de crédito **más** que a una de
débito, y sin `Card` habría que duplicarlos en `Account`. La cuenta `credit` guarda los
hechos de plata (saldo derivado, línea, ciclo); la `Card`, los de identidad. Como efecto
lateral, una tarjeta adicional sobre la misma línea queda representable sin cambiar el
modelo.

`Wallet.accountId` es la fuente de verdad y `cardId` solo una etiqueta: guardar únicamente
la tarjeta obligaría a registrar un plástico para poder tener Yape, que financieramente no
hace falta. Cuando hay `cardId`, el store deriva `accountId` de la tarjeta para que no
puedan quedar en desacuerdo.

## Alternativas descartadas

- **Toda tarjeta es una cuenta con saldo**: la de débito duplicaría la plata del banco
  (S/ 2,400 en BCP + S/ 2,400 en «la tarjeta» = S/ 4,800 que no existen).
- **Tarjetas como medios con nombre, sin deuda ni línea**: lo más barato, pero nunca
  contesta «¿cuánto debo?», que es la mitad de lo que se pidió.
- **El gasto cuenta al pagar el estado de cuenta** (criterio de caja): mejor flujo de
  caja, pero el consumo del mes llega como una bola sin categoría.
- **Llevar las dos lecturas en paralelo** (consumido y salido de cuentas): más honesto
  que cualquiera de las dos solo, pero duplica cada número de la app y obliga a aclarar
  en cada pantalla cuál se está viendo.
- **Generar 12 movimientos de cuota**: el presupuesto cuadra solo, pero la compra real
  desaparece del historial, se llena de entradas que el usuario no registró, y borrar
  una compra obliga a cazar doce movimientos.
- **El gasto entero al comprar, sin plan de cuotas**: coherente a rajatabla con D2, pero
  revienta el presupuesto y convierte la alerta del 90% en ruido.
- **Que Kumi calcule el «por pagar» y no pida confirmación**: cero fricción, pero una
  diferencia inexplicada todos los meses en el número más importante de la pantalla.
- **Que Kumi no estime nada y solo muestre lo declarado**: nunca miente, pero la tarjeta
  queda muda entre el pago y el cierre siguiente, que es cuando más se consume.
- **Disponible descontando toda la deuda, en curso incluido**: nunca te hace sentir más
  rico de lo que sos, pero castiga hoy lo que se paga en siete semanas.
- **Solo el flujo «Pagar tarjeta», sin transferencia genérica**: más barato, pero deja el
  retiro de cajero sin representar y obliga a construir igual la mecánica de dos cuentas
  en un movimiento, solo que escondida.
- **Pagar la tarjeta como gasto de categoría «Pago de tarjeta»**: cero cambios al modelo
  y doble conteo garantizado.

## Consecuencias

- **Enmienda al ADR 0003**: la tríada temporal se rompe a propósito. Ver la enmienda ahí.
- `BACKUP_VERSION` sube a 5: entran `cards` y `wallets` (aditivos, default `[]`) y los
  campos de crédito en `Account`. Los respaldos v1–v4 se siguen importando.
- «En cuentas» pasa a filtrar por `kind !== 'credit'`. Un respaldo viejo no tiene cuentas
  `credit`, así que el total no cambia para nadie.
- Se levanta la reserva de la palabra **Disponible** (ADR 0001, D7).
- **Pago mínimo**: se guarda si el usuario lo carga, pero la UI no lo ofrece como acción
  cómoda. Pagar el mínimo es la trampa cara de la tarjeta y Kumi no la va a facilitar.
- El trabajo se entrega en seis bloques, cada uno mergeable y usable por sí solo:
  **1** fundación (modelo + CRUD de cuentas y tarjetas + Yape con origen) ·
  **2** transferencias · **3** tarjeta viva (ciclo, conciliación, pagar) · **4** cuotas ·
  **5** calendario y recordatorios · **6** Disponible.
  Tras el bloque 1 se para a cargar la billetera real antes de seguir — el mismo criterio
  con que el ADR 0001 dejó las transferencias «para F1c tras probar el piloto con flujo
  Yape real».
