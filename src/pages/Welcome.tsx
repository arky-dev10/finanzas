import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseAmountToCents, sanitizeAmount } from '@/lib/format'
import { completeOnboarding, useData } from '@/lib/store'

/**
 * Bienvenida de un solo paso. Existe para no inventar un tope mensual que el
 * usuario no eligió: antes la app arrancaba con S/ 3,500 hardcodeado y el
 * Resumen mostraba "64% del presupuesto" contra un número que nadie puso.
 *
 * Solo la ve quien no tiene datos guardados. Quien ya venía usando la app
 * conserva su tope y no pasa por acá (ver `parseData` en lib/backup.ts).
 */
export function Welcome() {
  const data = useData()
  const navigate = useNavigate()
  const [valor, setValor] = useState('')

  // Si ya pasó por acá, esta ruta no tiene nada que hacer.
  if (data.onboarded) return <Navigate to="/" replace />

  const monto = parseAmountToCents(valor.trim()) ?? 0
  const valido = monto > 0

  /** `cents` en 0 = "definirlo después". */
  function empezar(cents: number) {
    completeOnboarding(cents)
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-svh flex-col justify-center gap-7 px-6 pb-10 pt-nav">
      <div className="flex flex-col items-center gap-4 text-center">
        <img
          src="/pwa-192x192.png"
          alt=""
          width={64}
          height={64}
          className="rounded-2xl shadow-sm"
        />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-bold tracking-tight">Finanzas</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Anota lo que gastas y mira en qué se te va el mes.
          </p>
        </div>
      </div>

      <section className="surface flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold">
            ¿Cuánto quieres gastar como máximo al mes?
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            El Resumen te dirá qué porcentaje de ese tope llevas gastado. Puedes
            cambiarlo cuando quieras desde Ajustes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">S/</span>
          <Input
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Tope de gasto mensual"
            value={valor}
            onChange={(e) => setValor(sanitizeAmount(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valido) empezar(monto)
            }}
          />
        </div>

        <Button onClick={() => empezar(monto)} disabled={!valido} className="h-12">
          Empezar
        </Button>
      </section>

      <button
        onClick={() => empezar(0)}
        className="mx-auto text-sm text-muted-foreground underline-offset-4 transition hover:underline"
      >
        Definirlo después
      </button>
    </div>
  )
}
