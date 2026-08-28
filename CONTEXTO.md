# Finanzas — App de registro de gastos personales

App PWA para llevar el control de **gastos e ingresos mensuales/diarios por categorías**.
Enfocada en ser **rápida de registrar**, **fácil de visualizar** y **funcional en offline**.

---

## Contexto y decisiones

| Decision | Valor |
|---|---|
| Propósito | Registro personal de finanzas (gastos/ingresos por categoría) |
| Plataforma | PWA instalable en móvil (Android/iOS vía "Añadir a pantalla de inicio") |
| Moneda | Soles peruanos — `S/ 1,234.50` (formato `es-PE`) |
| Almacenamiento | **Local / offline** (`localStorage`), sin servidor ni cuenta |
| Dispositivo principal | Móvil (vista mobile-first, marco 480px) |

---

## Stack

- **Vite 8** + **React 19** (TypeScript, `tsc` 6)
- **Tailwind CSS v4** (vía `@tailwindcss/vite`)
- **shadcn/ui** (estilo `base-nova`, tokens en `src/index.css`)
- **lucide-react** — iconos
- **react-router-dom** — navegación entre pantallas
- **vite-plugin-pwa** — service worker + manifest (modo `generateSW`, `autoUpdate`)

### Scripts
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
├── main.tsx                 # Bootstrap: Router + Toaster + AppLayout
├── App.tsx                  # (eliminado, reemplazado por páginas)
├── index.css                # Tailwind + tokens shadcn + marco mobile/safe-areas
├── types.ts                 # Category, Transaction, TxType
├── lib/
│   ├── format.ts            # formatMoney (S/.), monthKey/Label, fechas
│   ├── icons.ts             # mapa nombre→icono lucide (ICONS, getIcon)
│   └── store.ts             # store local (useSyncExternalStore) + acciones
├── components/
│   ├── AppLayout.tsx        # Shell: <Outlet/> + BottomNav
│   ├── BottomNav.tsx        # Barra inferior fija + FAB registrar
│   ├── MonthNav.tsx         # Selector de mes (‹ mes ›)
│   ├── CategoryIcon.tsx     # Icono en círculo con color de la categoría
│   ├── TransactionItem.tsx  # Fila de movimiento (icono, monto, eliminar)
│   └── ui/                  # botones, card, input, label, sonner (shadcn)
└── pages/
    ├── Dashboard.tsx        # Resumen mensual
    ├── AddTransaction.tsx   # Registro rápido
    ├── Categories.tsx       # Gestión de categorías
    └── History.tsx          # Historial por mes
```

### Modelo de datos (`src/types.ts`)
```ts
type TxType = 'expense' | 'income'

interface Category {
  id: string
  name: string
  icon: string      // nombre del icono lucide (ver lib/icons.ts)
  color: string     // hex
  type: TxType
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

### Store local (`src/lib/store.ts`)
- Persistencia en `localStorage` bajo la clave `finanzas-data-v1`.
- Estado global con `useSyncExternalStore` → las pantallas se re-renderizan al cambiar datos.
- Categorías por defecto sembradas en el primer arranque (8 gastos + 2 ingresos).
- Acciones: `addTransaction`, `deleteTransaction`, `addCategory`, `updateCategory`, `deleteCategory`.
- Selectores: `transactionsByMonth`, `monthTotals`, `expenseByCategory`, `getCategory`.

---

## Pantallas

### 1. Resumen (`/`)
- Navegador de mes.
- Tarjeta de **balance** con ingresos (verde) y gastos (rojo).
- **Gastos por categoría**: barras horizontales proporcionales al máximo.
- **Movimientos recientes** (últimos 8) + botón "Ver todo".
- CTA fijo "Registrar movimiento".

### 2. Registrar (`/registrar`)
- Monto grande central con prefijo `S/`.
- Toggle **Gasto / Ingreso** (filtra las categorías visibles).
- Grid de **categorías** como chips con icono.
- Fecha (default hoy) y nota opcional.
- Valida monto > 0 y categoría elegida antes de guardar.

### 3. Categorías (`/categorias`)
- Lista separada en Gastos / Ingresos.
- Crear categoría: nombre + tipo + color (paleta) + icono (grid lucide).
- Eliminar (borra también sus movimientos).

### 4. Historial (`/historial`)
- Selector de mes + totales (ingresos / gastos / balance).
- Lista completa del mes con opción de eliminar.

---

## PWA

- `vite.config.ts` → `VitePWA` con `registerType: 'autoUpdate'`.
- `manifest.webmanifest`: nombre "Finanzas", `display: standalone`, theme `#1e293b`.
- Iconos `public/pwa-192x192.png` y `public/pwa-512x512.png` (generados con PIL).
- `index.html`: `theme-color`, `apple-touch-icon`, `viewport-fit=cover`.
- Funciona **sin conexión** gracias al service worker (precache de la app shell).

---

## Estado actual
- [x] Scaffold Vite 8 + Tailwind v4 + shadcn
- [x] PWA (manifest + SW)
- [x] Store local + formato S/.
- [x] Shell mobile + bottom nav
- [x] 4 pantallas funcionales
- [x] Build y dev server verificados (sin errores de compilación/import)

> Pendiente de validación visual en navegador real (no se generó screenshot en el sandbox).

---

## Roadmap sugerido
- **Presupuestos** por categoría con alerta al excederse.
- **Tema oscuro** (ya soportado por los tokens shadcn).
- **Respaldo**: exportar / importar datos en JSON.
- **Filtros** en historial (por categoría, por tipo).
- **Gráficos** de evolución mensual.
- **Edición** de movimientos y categorías (no solo crear/eliminar).
