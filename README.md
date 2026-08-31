# Kumi

App PWA para llevar el control de gastos e ingresos mensuales por categorías, en soles y
sin conexión. Documentación completa (decisiones de producto, arquitectura, modelo de
datos) en [`CONTEXTO.md`](./CONTEXTO.md).

```bash
npm install
npm run dev       # desarrollo (PWA activa en dev)
npm run build     # tsc -b && vite build + genera sw.js / manifest
npm run icons     # regenera íconos y splashes desde assets/brand/kumi-logo.png
npm run preview   # sirve el build para probar la PWA instalable
npm run lint      # oxlint
```

Stack: Vite 8 + React 19 (TypeScript) · Tailwind CSS v4 + shadcn/ui · vite-plugin-pwa ·
sharp (solo dev, para íconos).
