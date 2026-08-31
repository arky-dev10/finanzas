import { formatMoney } from '@/lib/format'

export interface Slice {
  id: string
  label: string
  value: number
  color: string
}

/*
 * El agujero tiene que dar para el monto del mes: con R=52 y trazo 22 quedaban
 * 82px de ancho útil y "S/ 1,866.90" se montaba sobre el anillo.
 */
const R = 64
const STROKE = 20
const C = 2 * Math.PI * R
/** Separación entre porciones, en px de circunferencia (regla de 2px de la guía de dataviz). */
const GAP = 3

/**
 * Dona de gastos. La identidad nunca depende solo del color: cada porción
 * tiene su fila en la leyenda con nombre + monto + %, que además es el
 * objetivo de tap principal (más cómodo que el anillo en móvil).
 */
export function DonutChart({
  slices,
  total,
  selectedId,
  onSelect,
}: {
  slices: Slice[]
  /** Gasto neto del mes: el número del centro y el denominador de los %. */
  total: number
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  // La geometría del anillo sí se reparte entre las porciones: tiene que cerrar 360°.
  const dibujado = slices.reduce((s, x) => s + x.value, 0)
  const selected = slices.find((s) => s.id === selectedId) ?? null

  let running = 0
  const arcs: (Slice & { len: number; offset: number })[] = []
  for (const s of slices) {
    const full = (s.value / dibujado) * C
    arcs.push({ ...s, len: Math.max(full - GAP, 1), offset: running })
    running += full
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width={2 * (R + STROKE / 2)} height={2 * (R + STROKE / 2)} role="img" aria-label="Gastos por categoría">
          <g transform={`translate(${R + STROKE / 2}, ${R + STROKE / 2}) rotate(-90)`}>
            <circle
              r={R}
              fill="none"
              stroke="currentColor"
              className="text-muted"
              strokeWidth={STROKE}
            />
            {arcs.map((a) => {
              const dim = selectedId !== null && selectedId !== a.id
              return (
                <circle
                  key={a.id}
                  r={R}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={selectedId === a.id ? STROKE + 6 : STROKE}
                  strokeDasharray={`${a.len} ${C - a.len}`}
                  strokeDashoffset={-a.offset}
                  opacity={dim ? 0.28 : 1}
                  className="cursor-pointer transition-all"
                  onClick={() => onSelect(selectedId === a.id ? null : a.id)}
                />
              )
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          {selected ? (
            <>
              <span className="max-w-[104px] truncate text-[11px] text-muted-foreground">
                {selected.label}
              </span>
              <span className="text-base font-bold tabular-nums">
                {formatMoney(selected.value)}
              </span>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {Math.round((selected.value / total) * 100)}%
              </span>
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted-foreground">Gastos</span>
              <span className="text-base font-bold tabular-nums">{formatMoney(total)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
