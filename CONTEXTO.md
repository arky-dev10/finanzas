# Kumi — App de registro de gastos personales

App PWA para llevar el control de **gastos e ingresos mensuales por categorías**.
Enfocada en ser **rápida de registrar**, **fácil de leer de un vistazo** y **funcional offline**.

---

## Contexto y decisiones

| Decisión | Valor |
|---|---|
| Propósito | Registro personal de finanzas (gastos/ingresos por categoría) |
| Plataforma | PWA instalable en móvil (Android/iOS vía "Añadir a pantalla de inicio") |
| Moneda | Soles peruanos — `S/ 1,234.50` (formato `es-PE`) |
| Almacenamiento | **Local / offline** (`localStorage`), sin servidor ni cuenta |
| Respaldo | Exportar/importar JSON desde Ajustes (única defensa ante pérdida de datos) |
| Dispositivo principal | Móvil (mobile-first, marco de 480px en escritorio) |
| Gráficos | **SVG propio, sin librería** — 0 KB extra, tap nativo en móvil |

### Jerarquía del dashboard (regla de diseño)

El Resumen responde cuatro preguntas, en este orden. Todo lo demás es navegación:

1. **¿Cuánto dinero tengo?** — una sola tarjeta: balance + variación vs. mes anterior,
   ingresos/gastos, y al pie el avance del tope del mes (% · barra · cuánto queda de cuánto).
2. **¿En qué se me está yendo?** — top 3 categorías, con el resto colapsado.
3. **¿Me pasé de algún presupuesto?** — **solo** aparece si una *categoría* llegó al 90% o se pasó.
4. **¿Qué fue lo último que pasó?** — últimos 5 movimientos.

Comparar meses y explorar la dona son *navegación*, y viven en **Historial**.

### Dos presupuestos, no uno

Conviven dos cosas distintas y no hay que confundirlas:

- **Tope mensual global** (`Data.monthlyBudget`): el "no quiero gastar más de esto en el
  mes". **No tiene valor por defecto**: lo elige el usuario en la bienvenida y se edita en
  **Ajustes**; `0` lo desactiva. Es el bloque "Presupuesto del mes" al pie de la tarjeta de
  balance.

  > Antes arrancaba en 3500 hardcodeado y el Resumen mostraba "64% del presupuesto" contra
  > un número que nadie había elegido. Ver **Bienvenida** más abajo.
- **Presupuesto por categoría** (`Category.budget`, opcional): se edita en **Categorías** y
  solo asoma en el Resumen cuando esa categoría llegó al 90%.

Los dos comparten `budgetState()` (color + texto + icono), así que "En rango / Casi al límite /
Al límite / Te pasaste" significa lo mismo en ambos.

El bloque del tope **no repite el gasto del mes** (ya está arriba, en "Gastos"): muestra
porcentaje, cuánto queda y contra qué tope — "quedan S/ 1,400.00 de S/ 3,500.00". Si te
pasaste, la barra se llena al 100% y el exceso se dice con el monto:
"S/ 240.00 sobre los S/ 3,500.00".

---

## Stack

- **Vite 8** + **React 19** (TypeScript, `tsc` 6)
- **Tailwind CSS v4** (vía `@tailwindcss/vite`) · **shadcn/ui** (estilo `base-nova`)
- **lucide-react** (iconos) · **react-router-dom** · **sonner** (toasts con "Deshacer")
- **vite-plugin-pwa** — service worker + manifest (`generateSW`, modo `prompt`)
- **sharp** (solo dev) — genera íconos y splashes desde `scripts/`
- **vitest** (solo dev) — tests del modelo (`src/lib/*.test.ts`), con `vitest.config.ts`
  propio para no arrastrar React ni el plugin de PWA a los tests

```bash
npm run dev       # desarrollo (PWA activa en dev)
npm run build     # tsc -b && vite build + genera sw.js / manifest
npm run test      # vitest run — modelo financiero (dinero, saldos, migración)
npm run icons     # regenera íconos y splashes (solo si cambia la marca)
npm run preview   # sirve el build para probar la PWA instalable
npm run lint      # oxlint
```

---

## Arquitectura

```
src/
├── main.tsx                 # Router + Toaster + AppLayout
├── index.css                # Tailwind + tokens shadcn + .surface + marco mobile
├── types.ts                 # Account, Category, Transaction, TxNature, Medium
├── lib/
│   ├── pwa.ts               # useInstall(): prompt de instalación + detección standalone
│   ├── format.ts            # céntimos ↔ soles, meses, ciclo (monthKeyFor), sanitizeAmount
│   ├── budget.ts            # estado de presupuesto (color + texto + icono) + tope por defecto
│   ├── backup.ts            # serializar / validar / MIGRAR el JSON importado
│   ├── routes.ts            # hidesNav(): rutas de formulario sin barra inferior
│   ├── icons.ts             # mapa nombre→icono lucide
│   └── store.ts             # store local (useSyncExternalStore) + acciones + saldos
├── components/
│   ├── AppLayout.tsx        # Shell: <Outlet/> + BottomNav
│   ├── PwaUpdater.tsx       # Registra el SW y avisa "hay versión nueva"
│   ├── BottomNav.tsx        # Barra de 4 items + FAB flotante abajo a la derecha
│   ├── MonthNav.tsx         # ‹ mes › (tocar el mes vuelve al actual; muestra el rango del ciclo si no es calendario)
│   ├── CategoryIcon.tsx     # Icono en cuadro con el color de la categoría
│   ├── TransactionItem.tsx  # Fila: tap para editar, tacho con "Deshacer"
│   ├── charts/
│   │   ├── DonutChart.tsx   # Dona interactiva (tap → centro muestra la categoría)
│   │   └── MonthlyBars.tsx  # Barras de 6 meses (tap → cambia de mes)
│   └── ui/                  # botones, card, input, label, sonner (shadcn)
└── pages/
    ├── Dashboard.tsx        # Resumen (los 4 niveles de arriba)  
    ├── AddTransaction.tsx   # Registrar y editar (/registrar y /registrar/:id)
    ├── Categories.tsx       # Categorías + presupuestos + colores/iconos
    ├── History.tsx          # Barras de meses + dona + lista del mes
    └── Settings.tsx         # Instalar app + presupuesto mensual + ciclo mensual + respaldo JSON
scripts/
├── apple-splash.ts          # Lista de pantallas iOS (la usan el generador y vite.config)
└── generate-icons.ts        # Logo de Kumi → íconos, maskable, apple-touch, splashes
```

### Modelo de datos

El *porqué* de este modelo está en `docs/adr/0001-modelo-financiero.md` y
`docs/adr/0004-tarjetas-y-deuda.md`, y el vocabulario exacto (cuenta, tarjeta,
medio, movimiento, naturaleza, saldo, deuda, línea, «en cuentas») en
`CONTEXT.md`. Acá va solo la forma.

**Toda la plata son céntimos enteros** (S/ 12.50 = `1250`). Los soles existen
solo como el string que el usuario tipea: entran con `parseAmountToCents` y
salen con `formatMoney`, que **recibe céntimos**. En el medio no hay decimales,
así las comparaciones de presupuesto son exactas.

**Todo campo de plata lleva el sufijo `Cents`** — en los tipos, en el respaldo y
en lo que devuelven los selectores. No es cosmético: soles y céntimos son los dos
`number`, así que el compilador no distingue uno de otro y el sufijo es lo único
que avisa. Los dos bugs de ×100 que hubo en este modelo salieron justo de campos
que guardaban céntimos sin decirlo en el nombre.

```ts
type AccountKind = 'bank' | 'cash' | 'credit'
type Medium = 'yape' | 'plin' | 'card' | 'transfer' | 'other'
type TxNature = 'expense' | 'income' | 'refund' | 'adjustment' | 'transfer'
type CategoryKind = 'expense' | 'income'
type CardKind = 'debit' | 'credit'
type CardBrand = 'visa' | 'mastercard' | 'amex' | 'diners'
type WalletProvider = 'yape' | 'plin'

// Donde vive la plata. Yape y Plin NO son cuentas: son medios (Wallet).
// `credit` es la excepción: guarda DEUDA, no plata del usuario, y por eso
// `totalInAccounts` la saltea. Su saldo es negativo por naturaleza.
interface Account {
  id: string
  name: string
  kind: AccountKind
  balancePending?: true   // sin ajuste inicial: su saldo no es confiable
  lastMedium?: Medium     // default recordado, se actualiza al registrar
  issuer?: string         // emisor peruano; catálogo abierto (lib/issuers.ts)
  creditLimitCents?: number  // solo credit: la línea aprobada
  closingDay?: number     // solo credit: día de cierre  (1–31, no 1–28)
  dueDay?: number         // solo credit: día de pago    (1–31, no 1–28)
  statementConfirmedOn?: string  // cierre del último estado de cuenta confirmado
}

// Llave para llegar a una cuenta, NO un lugar donde vive la plata.
// Débito → una cuenta `bank` que ya existe (sin saldo propio).
// Crédito → su cuenta `credit`, creada y borrada junto con ella.
// La cuenta guarda los hechos de plata; la tarjeta, los de identidad.
interface Card {
  id: string
  name: string
  kind: CardKind
  accountId: string
  brand?: CardBrand
  last4?: string   // 4 dígitos; el número completo NUNCA se guarda
}

// Yape/Plin con origen declarado: al elegirlos en Registrar, Kumi ya sabe de
// qué cuenta sale la plata. `accountId` es la verdad y `cardId` la etiqueta —
// cuando hay tarjeta, el store DERIVA la cuenta de ella para que no discrepen.
interface Wallet {
  id: string
  name: string
  provider: WalletProvider
  accountId: string
  cardId?: string
}

interface Category {
  id: string
  name: string
  icon: string       // nombre del icono lucide (ver lib/icons.ts)
  color: string      // hex
  type: CategoryKind
  budgetCents?: number  // presupuesto mensual, solo gastos
}

interface Transaction {
  id: string
  amountCents: number  // > 0 salvo adjustment, que lleva un delta con signo
  nature: TxNature
  accountId: string    // de dónde sale; en transfer, el origen
  toAccountId?: string // SOLO en transfer: la cuenta que recibe, nunca la misma
  categoryId?: string  // obligatorio salvo en adjustment y transfer
  medium?: Medium      // nunca en cuentas cash
  cardId?: string      // con qué tarjeta; es una etiqueta, no mueve el saldo
  installmentCount?: number  // en cuántas cuotas; 2+, solo en gastos con crédito
  date: string         // YYYY-MM-DD
  note?: string
}

// lo que vive en localStorage y en el respaldo
interface Data {
  accounts: Account[]
  cards: Card[]        // v5, aditivo
  wallets: Wallet[]    // v5, aditivo
  reminders: Reminder[]  // pagos e ingresos esperados; aditivo, sin bump
  categories: Category[]
  transactions: Transaction[]
  monthlyBudgetCents: number  // tope de todo el mes; 0 = sin tope
  monthStartDay: number   // día en que empieza el mes del usuario (1–28); 1 = calendario
  onboarded: boolean      // si ya pasó por la bienvenida; NO va en el respaldo
}
```

### Ciclo mensual configurable

Para quien cobra antes de fin de mes (el caso real: sueldo el 28), los gastos
del 28 al 31 de agosto pertenecen a *su* septiembre — agrupar por mes calendario
le "vaciaba" el Resumen al cambiar el mes. `monthStartDay` corrige eso:

- El ciclo etiquetado "M" va del `monthStartDay` del mes M−1 al día
  `monthStartDay − 1` del mes M, y **se etiqueta por el mes en que termina**
  (es el mes cuyo sueldo se gasta). Con inicio 28, "Septiembre 2026" =
  28-ago a 27-sep.
- **`monthStartDay: 1` es identidad exacta con el mes calendario** — el
  comportamiento de siempre, y el default de todo respaldo que no traiga el
  campo. El rango válido es 1–28: del 29 al 31 hay meses (febrero) que no
  llegan.
- El nombre visible del mes no cambia ("Septiembre 2026"); cuando el inicio no
  es 1, `MonthNav` muestra debajo un sublabel discreto con el rango
  ("28 ago – 27 sep").
- La pura aritmética vive en `lib/format.ts` (`monthKeyFor`, `cycleRange`,
  `cycleSublabel`); el agrupado entra por `transactionsByMonth` y los demás
  selectores mensuales lo heredan. El "mes actual" de la navegación es
  `currentMonthKey()` (el ciclo donde cae hoy). Los saldos de cuentas no se
  agrupan por mes: el ciclo no los toca.
- **No subió `BACKUP_VERSION`**: es un campo aditivo con default seguro, no un
  cambio de semántica de lectura como soles→céntimos (ver el comentario junto a
  `BACKUP_VERSION`).
- **Compatibilidad**: un dispositivo con la app vieja que sincronice o importe
  un respaldo nuevo ignora el campo — sigue viendo meses calendario hasta
  actualizar la app. No rompe nada; solo ve otro agrupado.

### Dirección no es naturaleza

«Todo dinero recibido es una entrada, pero no toda entrada es un ingreso.» De
ahí salen dos aritméticas distintas, y confundirlas es el error clásico:

| | **Saldo de cuenta** | **Análisis y presupuesto** |
|---|---|---|
| `income` | suma | ingreso del mes |
| `expense` | resta | gasto del mes |
| `refund` | suma | **resta del gasto** de su categoría, nunca suma a ingresos |
| `adjustment` | suma su delta | **invisible** |

La devolución pega en el **mes en que ocurre**, sin vínculo al gasto original y
sin reescribir meses cerrados. Por eso el gasto neto de una categoría puede
quedar en 0 o negativo: `expenseByCategory` lo devuelve tal cual y es la
pantalla la que decide si eso se grafica.

El ajuste es invisible para totales, presupuesto y gráficos, pero **es un
movimiento real y se lista en el Historial**: calibra el saldo de una cuenta
contra la realidad en vez de inventar un gasto o un ingreso para cuadrar.

### Store (`src/lib/store.ts`)

- Persiste en `localStorage` bajo `finanzas-data-v1`, **validando al leer** (`parseData`)
  para que un dato corrupto no rompa el arranque.
- Estado global con `useSyncExternalStore`. **Toda pantalla que muestre datos debe llamar
  `useData()`** o no se entera de los cambios.
- Acciones: `addTransaction`, `insertTransaction` (deshacer), `updateTransaction`,
  `deleteTransaction`, `addAdjustment` (calibrar una cuenta), `addCategory`,
  `updateCategory`, `deleteCategory` (devuelve lo borrado), `restoreCategory`,
  `setMonthlyBudgetCents`, `setMonthStartDay` (día de inicio del ciclo, 1–28),
  `replaceData` (importar, devuelve lo previo).
- Selectores: `transactionsByMonth`, `monthTotals`, `expenseByCategory`,
  `lastMonthsTotals`, `monthlyBudgetStatus` (tope global, `null` si no hay),
  `budgetStatus` (por categoría), `currentMonthKey` (el ciclo donde cae hoy),
  `accountBalanceCents`, `totalInAccounts`, `signedCents`, `getCategory`,
  `getAccount`, `getTransaction`. Los selectores mensuales agrupan por **ciclo**
  (`monthKeyFor`), no por mes calendario — con `monthStartDay: 1` es lo mismo.
- **`totalInAccounts()`** devuelve `{ totalCents, reliable }` y es lo que el Resumen
  muestra como «En cuentas» — *no* como «Disponible», que queda reservado para cuando
  pueda descontar compromisos y deuda. Las cuentas con `balancePending` quedan **fuera
  de la suma**: su saldo es desconocido, no cero, y sumarlas metería sus gastos sin su
  saldo inicial. `reliable: false` avisa que falta calibrar alguna.
- **`addAdjustment(accountId, targetBalanceCents, date?)`** anota el delta que falta para
  llegar al saldo real y limpia `balancePending`. Si ya cuadraba no anota nada, pero igual
  da el saldo por configurado: un «Ajuste S/ 0.00» en el historial sería ruido.
- **`replaceData` copia campo por campo**: si algún día `Data` gana un campo nuevo, hay
  que sumarlo ahí o importar un respaldo lo pierde en silencio.
- El respaldo va por **`BACKUP_VERSION = 4`** (v3 trajo céntimos, cuentas y naturalezas;
  v4 renombró `budget`/`monthlyBudget` a `budgetCents`/`monthlyBudgetCents`). Los archivos
  v1, v2 y v3 se siguen importando y `parseData` los migra (ver abajo).

---

## Bienvenida (y por qué existe)

`Welcome.tsx`, ruta `/bienvenida`, **fuera** del `AppLayout` (pantalla completa, sin barra
inferior). Un solo paso: el tope mensual, con "Definirlo después" como salida.

Existe para **no inventar un número**. El tope arrancaba en `DEFAULT_MONTHLY_BUDGET = 3500`,
así que el Resumen decía "64% · quedan S/ 1,252 de S/ 3,500" desde el día uno contra un monto
que el usuario nunca eligió. La constante ya no existe.

**El guard vive en `AppLayout`**: `if (!onboarded) return <Navigate to="/bienvenida" />`.
Como todas las rutas reales cuelgan del layout, no hay forma de esquivarlo. `Welcome` hace
el redirect inverso si `onboarded` ya es true.

### Migración: quién ve la bienvenida y quién no

La regla está en `parseData` (`lib/backup.ts`): **`onboarded` ausente ⇒ `true`**. Tener datos
guardados, o importar un respaldo, significa que no sos nuevo.

| Situación | Qué pasa |
|---|---|
| Ya venía usando la app (tenía `monthlyBudget: 3500` en soles) | No ve la bienvenida, **conserva su 3500**, migrado a `350000` céntimos |
| Ya venía usando la app y había puesto el tope en 0 | No ve la bienvenida (no se le re-pregunta algo que ya decidió) |
| localStorage vacío | Bienvenida |
| localStorage corrupto | Bienvenida (`parseData` devuelve `null` → `initial()`) |
| Importa un respaldo v1 o v2 | Sin tope hasta definirlo; no se inventa un monto |

Verificado en el build de producción sembrando cada caso en `localStorage`.

`onboarded` **no va en el respaldo**: `toBackup` lo omite a propósito porque es estado de la
app, no plata.

### Migración a v3 (céntimos y cuentas)

`parseData` no es solo un validador: también migra. Un respaldo v1/v2 entra con
`amount` en soles y `type`, y sale con `amountCents`, `nature` y `accountId`. Todo el
historial pre-cuentas se asigna a **BCP**, que queda con `balancePending` porque su saldo
derivado es ficción hasta el primer ajuste; el ajuste inicial absorbe la diferencia, como
una conciliación bancaria. El tope mensual y los presupuestos por categoría también pasan
a céntimos.

> **El detalle que no se puede romper**: el localStorage viejo no guardaba `version`, así
> que no alcanza con mirar ese campo para saber si los datos ya están migrados — si nos
> equivocamos, la plata del usuario se multiplica por 100 al abrir la app. Antes de asumir
> que es v2, `looksMigrated()` mira la forma (¿hay `accounts`?, ¿hay `amountCents`?), y de
> ahora en más el store **guarda `version` al persistir**. Lo cuida el test *"no vuelve a
> multiplicar por 100 al releer lo que acaba de guardar"*.

Por lo mismo, **la migración de unidades se decide contra `CENTS_SINCE = 3`, no contra
`BACKUP_VERSION`**: si se comparara contra la versión actual, cada versión nueva que no
cambie la unidad —- como v4, que solo renombró campos —- volvería a multiplicar por 100 la
plata del usuario. v3 escribía `budget`/`monthlyBudget` ya en céntimos, así que `parseData`
lee cualquiera de los dos nombres y reconstruye la categoría para no dejar el campo viejo
colgando al lado del nuevo.

`resetData()` sí lo pone en `false`: "Borrar todo y empezar de cero" te devuelve a la
bienvenida, y el "Deshacer" del toast restaura el flag y te trae de vuelta al Resumen.

> Fricción conocida: quien reinstala la app y quiere restaurar un respaldo tiene que pasar
> por "Definirlo después" antes de llegar a Ajustes → Importar. El resultado final es
> correcto (el respaldo pisa el tope), pero son dos toques de más.

---

## PWA

La app es instalable de verdad, no un acceso directo. Verificado en build de
producción: Chrome dispara `beforeinstallprompt` (solo lo hace si se cumplen
**todos** los criterios), y matando el servidor `/historial` sigue cargando.

**La marca vive en un solo PNG fuente**, no en código ni en SVGs sueltos:
`assets/brand/kumi-logo.png` (el perrito dormido abrazando el gráfico) y
`scripts/generate-icons.ts` deriva de ahí todos los tamaños con `sharp`.
Correr `npm run icons` solo si cambia el PNG fuente; los PNG van commiteados.

El PNG fuente ya trae sus propias esquinas redondeadas y fondo crema
horneados (exportado como ícono de app clásico, con margen transparente
alrededor). El generador recorta ese margen una vez (`loadMark`) y arma cada
variante distinta a partir de la misma marca:

| Archivo | Por qué |
|---|---|
| `pwa-64/192/512` | Ícono normal: se reusan las esquinas redondeadas que ya trae el PNG fuente |
| `maskable-icon-512` | Cuadrado a sangre, marca al 62% sobre el mismo crema exacto del logo (`#faf7f2`): Android recorta en círculo y le comería un pedazo. Al ser el mismo tono, el margen y las esquinas redondeadas del recorte se funden con el fondo y no se ven |
| `apple-touch-icon-180` | Mismo truco del crema a sangre, sin redondear por separado: iOS aplica su propia máscara y quedaría doble |
| `apple-splash-*` (14) | Fondo crema plano + el logo centrado. Sin esto, abrir desde la pantalla de inicio en iOS muestra un rectángulo blanco; con el mismo crema del `--page` real, el salto entre el splash y la app cargada es invisible |
| `screenshots/*` | Sin ellas Chrome usa el diálogo de instalación mínimo en vez de la ficha rica. **Pendiente**: quedaron con el look anterior a este rebrand, hay que recapturarlas cuando los 4 frentes de "marca Kumi" estén mergeados |

**Actualizaciones: `prompt`, no `autoUpdate`.** Recargar en silencio a mitad de
"Registrar movimiento" te borra lo escrito. `PwaUpdater` avisa por toast y el
usuario decide cuándo; además rechequea cada hora si la app queda abierta.

**Instalar** vive en Ajustes y se esconde sola una vez instalada. Chromium abre
el diálogo nativo; Safari en iOS no tiene API para eso, así que ahí van las
instrucciones de Compartir → Añadir a pantalla de inicio.

Detalles que se sienten pero no se ven: `overscroll-behavior` (el gesto de
recargar de Android reiniciaba la app), `touch-action: manipulation` (mata el
delay de 300ms), `-webkit-tap-highlight-color: transparent`, `launch_handler`
(el atajo va a la ventana abierta) e `id` en el manifest (sin él, cambiar
`start_url` mañana crearía una instalación nueva).

> `color-scheme` pasó de `light dark` a `light`: la app todavía no tiene tema
> oscuro, y anunciar que lo soporta pintaba los inputs oscuros en un celular en
> modo noche mientras el resto seguía claro.

---

## Paleta de categorías

Los colores por defecto están **validados con el validador de dataviz** (pares adyacentes,
modo claro): CVD ΔE 9.1 (objetivo ≥8) y visión normal ΔE 19.6 (piso ≥15).

> La paleta anterior fallaba: `#8b5cf6` (Vivienda) y `#3b82f6` (Transporte) tenían ΔE 1.3
> con daltonismo deutan — indistinguibles. Y `#ec4899`/`#ef4444` estaban en ΔE 11.4 incluso
> con visión normal.

Tres colores quedan bajo 3:1 de contraste, lo que **obliga a etiquetas visibles**: por eso
cada fila y cada porción llevan siempre nombre y monto, nunca solo color.

Como el usuario puede elegir cualquier color al editar una categoría, la garantía real no
es la paleta sino la codificación secundaria (icono + nombre + monto siempre presentes).

---

## Estado actual

- [x] Pantallas: Resumen, Registrar/Editar, Calendario, Historial, Ajustes,
      Categorías, Cuentas y tarjetas (las últimas dos fuera de la barra)
- [x] Gráficos SVG interactivos (dona + barras mensuales)
- [x] Tope mensual global (S/ 3,500 por defecto): % y monto restante integrados en la
      tarjeta de balance del Resumen, editable desde Ajustes
- [x] Presupuestos por categoría con alerta al 90% y al pasarse
- [x] Editar movimientos · "Deshacer" al borrar movimiento o categoría
- [x] Respaldo JSON: exportar (Web Share o descarga), copiar, importar con validación
- [x] PWA de verdad: instalable, offline, con ícono propio (ver abajo)
- [x] Bienvenida de un paso: el tope mensual lo elige el usuario, no la app
- [x] Ciclo mensual configurable: "mi mes empieza el día N" (para quien cobra
      antes de fin de mes), con el rango del ciclo visible en la navegación
- [x] Verificado en navegador a 390×844 y 1280×900 con datos sembrados
      (los 3 estados del tope: 60% en rango, 89% casi al límite, 107% pasado)
- [x] Cuentas y tarjetas propias: crear, editar y borrar cuentas (antes solo
      existían las dos sembradas), tarjetas de débito y de crédito con su línea
      y su ciclo, y Yape/Plin con la cuenta de origen declarada (ADR 0004)
- [x] La deuda de tarjeta se lleva aparte y NUNCA suma a «En cuentas»; un gasto
      con tarjeta de crédito cuenta el día de la compra, con su categoría
- [x] Calendario (ADR 0003 + su enmienda): la grilla del ciclo con el rastro de
      lo gastado atrás y los compromisos adelante, recordatorios mensuales o de
      una vez con monto opcional, vencidas que se arrastran, y el flujo «Pagar»
      que registra el movimiento real y recién ahí marca la ocurrencia.
      Calendario toma el tab de Categorías, que pasa a Ajustes
- [x] Compras en cuotas: un solo movimiento con su plan, deuda entera desde el
      día uno y presupuesto que solo siente la cuota. La cuota reaparece en los
      ciclos siguientes como una fila propia («cuota 4 de 12»), para que el
      total del mes no tenga plata sin fila que la explique
- [x] Ciclo de facturación por tarjeta (`src/lib/cards.ts`): «por pagar y
      cuándo» como número protagonista, consumo en curso aparte, conciliación
      contra el estado de cuenta real y flujo Pagar prellenado
- [x] Transferencias entre cuentas propias (`nature: 'transfer'`, el F1c que el
      ADR 0001 dejó debiendo): pagar la tarjeta, retirar del cajero, pasar de un
      banco a otro. No son gasto ni ingreso y no tocan el presupuesto

### Pendiente / ideas

El bloque 6 del ADR 0004, en orden y cada uno mergeable por sí solo:

- **Disponible**: el número nuevo del Resumen.

- **Tema oscuro**: los tokens `.dark` ya existen en `index.css`, falta el toggle.
- **Filtros en historial** por categoría o tipo.
- **Recurrentes**: alquiler, sueldo y servicios se repiten todos los meses.
- El respaldo es manual; no hay sincronización entre dispositivos (es a propósito:
  sin servidor ni cuenta).
