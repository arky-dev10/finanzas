# Finanzas — App de registro de gastos personales

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

```bash
npm run dev       # desarrollo (PWA activa en dev)
npm run build     # tsc -b && vite build + genera sw.js / manifest
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
├── types.ts                 # Category (con budget?), Transaction, TxType
├── lib/
│   ├── pwa.ts               # useInstall(): prompt de instalación + detección standalone
│   ├── format.ts            # dinero, meses, shiftMonth, sanitizeAmount
│   ├── budget.ts            # estado de presupuesto (color + texto + icono) + tope por defecto
│   ├── backup.ts            # serializar / validar JSON importado
│   ├── routes.ts            # hidesNav(): rutas de formulario sin barra inferior
│   ├── icons.ts             # mapa nombre→icono lucide
│   └── store.ts             # store local (useSyncExternalStore) + acciones
├── components/
│   ├── AppLayout.tsx        # Shell: <Outlet/> + BottomNav
│   ├── PwaUpdater.tsx       # Registra el SW y avisa "hay versión nueva"
│   ├── BottomNav.tsx        # Barra de 4 items + FAB flotante abajo a la derecha
│   ├── MonthNav.tsx         # ‹ mes › (tocar el mes vuelve al actual)
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
    └── Settings.tsx         # Instalar app + presupuesto mensual + respaldo JSON
scripts/
├── apple-splash.ts          # Lista de pantallas iOS (la usan el generador y vite.config)
└── generate-icons.ts        # Marca "S/" → íconos, maskable, apple-touch, splashes
```

### Modelo de datos

```ts
type TxType = 'expense' | 'income'

interface Category {
  id: string
  name: string
  icon: string      // nombre del icono lucide (ver lib/icons.ts)
  color: string     // hex
  type: TxType
  budget?: number   // presupuesto mensual, solo gastos
}

interface Transaction {
  id: string
  amount: number
  categoryId: string
  type: TxType
  date: string      // YYYY-MM-DD
  note?: string
}

// lo que vive en localStorage y en el respaldo
interface Data {
  categories: Category[]
  transactions: Transaction[]
  monthlyBudget: number   // tope de todo el mes; 0 = sin tope, sin valor por defecto
  onboarded: boolean      // si ya pasó por la bienvenida; NO va en el respaldo
}
```

### Store (`src/lib/store.ts`)

- Persiste en `localStorage` bajo `finanzas-data-v1`, **validando al leer** (`parseData`)
  para que un dato corrupto no rompa el arranque.
- Estado global con `useSyncExternalStore`. **Toda pantalla que muestre datos debe llamar
  `useData()`** o no se entera de los cambios.
- Acciones: `addTransaction`, `insertTransaction` (deshacer), `updateTransaction`,
  `deleteTransaction`, `addCategory`, `updateCategory`, `deleteCategory` (devuelve lo
  borrado), `restoreCategory`, `setMonthlyBudget`, `replaceData` (importar, devuelve lo previo).
- Selectores: `transactionsByMonth`, `monthTotals`, `expenseByCategory`,
  `lastMonthsTotals`, `monthlyBudgetStatus` (tope global, `null` si no hay),
  `budgetStatus` (por categoría), `balanceTrend`, `getCategory`, `getTransaction`.
- El respaldo va por **`BACKUP_VERSION = 2`** (agregó `monthlyBudget`). Los archivos v1
  se siguen importando: si no traen el campo, cae en `DEFAULT_MONTHLY_BUDGET`.

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
| Ya venía usando la app (tiene `monthlyBudget: 3500` guardado) | No ve la bienvenida, **conserva su 3500** |
| Ya venía usando la app y había puesto el tope en 0 | No ve la bienvenida (no se le re-pregunta algo que ya decidió) |
| localStorage vacío | Bienvenida |
| localStorage corrupto | Bienvenida (`parseData` devuelve `null` → `initial()`) |
| Importa un respaldo v1 o v2 | Sin tope hasta definirlo; no se inventa un monto |

Verificado en el build de producción sembrando cada caso en `localStorage`.

`onboarded` **no va en el respaldo**: `toBackup` lo omite a propósito porque es estado de la
app, no plata. Por eso `BACKUP_VERSION` sigue en 2.

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

**La marca vive en código**, no en un SVG suelto: `scripts/generate-icons.ts`
dibuja la "S/" con dos arcos y una recta (sin fuentes, así que el render es
igual en cualquier máquina) y de ahí salen todos los tamaños. Correr
`npm run icons` solo si cambia la marca; los PNG van commiteados.

Cada variante existe por un motivo concreto:

| Archivo | Por qué |
|---|---|
| `pwa-64/192/512` | Ícono normal, con esquinas redondeadas propias |
| `maskable-icon-512` | Cuadrado a sangre, marca al 62%: Android recorta en círculo y le comería un pedazo |
| `apple-touch-icon-180` | Sin redondear: iOS aplica su propia máscara y quedaría doble |
| `apple-splash-*` (14) | Sin esto, abrir desde la pantalla de inicio en iOS muestra un rectángulo blanco |
| `screenshots/*` | Sin ellas Chrome usa el diálogo de instalación mínimo en vez de la ficha rica |

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

- [x] 5 pantallas: Resumen, Registrar/Editar, Categorías, Historial, Ajustes
- [x] Gráficos SVG interactivos (dona + barras mensuales)
- [x] Tope mensual global (S/ 3,500 por defecto): % y monto restante integrados en la
      tarjeta de balance del Resumen, editable desde Ajustes
- [x] Presupuestos por categoría con alerta al 90% y al pasarse
- [x] Editar movimientos · "Deshacer" al borrar movimiento o categoría
- [x] Respaldo JSON: exportar (Web Share o descarga), copiar, importar con validación
- [x] PWA de verdad: instalable, offline, con ícono propio (ver abajo)
- [x] Bienvenida de un paso: el tope mensual lo elige el usuario, no la app
- [x] Verificado en navegador a 390×844 y 1280×900 con datos sembrados
      (los 3 estados del tope: 60% en rango, 89% casi al límite, 107% pasado)

### Pendiente / ideas

- **Tema oscuro**: los tokens `.dark` ya existen en `index.css`, falta el toggle.
- **Filtros en historial** por categoría o tipo.
- **Recurrentes**: alquiler, sueldo y servicios se repiten todos los meses.
- El respaldo es manual; no hay sincronización entre dispositivos (es a propósito:
  sin servidor ni cuenta).
