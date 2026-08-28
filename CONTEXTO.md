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

1. **¿Cuánto dinero tengo?** — balance del mes + variación vs. mes anterior. Siempre visible.
2. **¿En qué se me está yendo?** — top 3 categorías, con el resto colapsado.
3. **¿Me pasé de algún presupuesto?** — **solo** aparece si algo llegó al 90% o se pasó.
4. **¿Qué fue lo último que pasó?** — últimos 5 movimientos.

Comparar meses y explorar la dona son *navegación*, y viven en **Historial**.

---

## Stack

- **Vite 8** + **React 19** (TypeScript, `tsc` 6)
- **Tailwind CSS v4** (vía `@tailwindcss/vite`) · **shadcn/ui** (estilo `base-nova`)
- **lucide-react** (iconos) · **react-router-dom** · **sonner** (toasts con "Deshacer")
- **vite-plugin-pwa** — service worker + manifest (`generateSW`, `autoUpdate`)

```bash
npm run dev       # desarrollo (PWA activa en dev)
npm run build     # tsc -b && vite build + genera sw.js / manifest
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
│   ├── format.ts            # dinero, meses, shiftMonth, sanitizeAmount
│   ├── budget.ts            # estado de presupuesto (color + texto + icono)
│   ├── backup.ts            # serializar / validar JSON importado
│   ├── routes.ts            # hidesNav(): rutas de formulario sin barra inferior
│   ├── icons.ts             # mapa nombre→icono lucide
│   └── store.ts             # store local (useSyncExternalStore) + acciones
├── components/
│   ├── AppLayout.tsx        # Shell: <Outlet/> + BottomNav
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
    └── Settings.tsx         # Respaldo JSON (exportar / copiar / importar)
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
```

### Store (`src/lib/store.ts`)

- Persiste en `localStorage` bajo `finanzas-data-v1`, **validando al leer** (`parseData`)
  para que un dato corrupto no rompa el arranque.
- Estado global con `useSyncExternalStore`. **Toda pantalla que muestre datos debe llamar
  `useData()`** o no se entera de los cambios.
- Acciones: `addTransaction`, `insertTransaction` (deshacer), `updateTransaction`,
  `deleteTransaction`, `addCategory`, `updateCategory`, `deleteCategory` (devuelve lo
  borrado), `restoreCategory`, `replaceData` (importar, devuelve lo previo).
- Selectores: `transactionsByMonth`, `monthTotals`, `expenseByCategory`,
  `lastMonthsTotals`, `budgetStatus`, `balanceTrend`, `getCategory`, `getTransaction`.

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
- [x] Presupuestos por categoría con alerta al 90% y al pasarse
- [x] Editar movimientos · "Deshacer" al borrar movimiento o categoría
- [x] Respaldo JSON: exportar (Web Share o descarga), copiar, importar con validación
- [x] PWA verificada en build de producción (SW activo, manifest `lang: es`)
- [x] Verificado en navegador a 390×844 con datos sembrados de 3 meses

### Pendiente / ideas

- **Tema oscuro**: los tokens `.dark` ya existen en `index.css`, falta el toggle.
- **Filtros en historial** por categoría o tipo.
- **Recurrentes**: alquiler, sueldo y servicios se repiten todos los meses.
- El respaldo es manual; no hay sincronización entre dispositivos (es a propósito:
  sin servidor ni cuenta).
