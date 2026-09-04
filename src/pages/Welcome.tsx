import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseAmountToCents, sanitizeAmount } from '@/lib/format'
import { addAdjustment, completeOnboarding, useData } from '@/lib/store'

type Step = 'budget' | 'balances'

/**
 * Bienvenida de dos pasos. El primero existe para no inventar un tope mensual
 * que el usuario no eligió: antes la app arrancaba con S/ 3,500 hardcodeado y
 * el Resumen mostraba "64% del presupuesto" contra un número que nadie puso.
 * El segundo pide el saldo real de cada cuenta para que "En cuentas" no mienta
 * desde el primer día; es opcional de verdad, así que no tiene otro gate que
 * dejarlo en blanco (la cuenta queda con su saldo pendiente de configurar).
 *
 * Solo la ve quien no tiene datos guardados. Quien ya venía usando la app
 * conserva su tope y no pasa por acá (ver `parseData` en lib/backup.ts).
 */
export function Welcome() {
  const { accounts, onboarded } = useData()
  /*
   * Solo cuentas del usuario. Hoy no puede haber tarjetas de crédito acá (esta
   * pantalla vive antes del onboarding y `initial()` no siembra ninguna), pero
   * la pregunta es «¿cuánto tienes?» y a una tarjeta habría que preguntarle
   * cuánto DEBE: dejarlo dependiendo de lo que siembre otro módulo es confiar
   * demasiado lejos.
   */
  const propias = accounts.filter((a) => a.kind !== 'credit')
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('budget')
  const [valor, setValor] = useState('')
  const [saldos, setSaldos] = useState<Record<string, string>>({})

  // Si ya pasó por acá, esta ruta no tiene nada que hacer.
  if (onboarded) return <Navigate to="/" replace />

  const monto = parseAmountToCents(valor.trim()) ?? 0
  const valido = monto > 0

  function empezar() {
    completeOnboarding(valido ? monto : 0)
    // Solo calibra las cuentas donde el usuario tipeó algo; el resto queda
    // como la sembró el store (BCP pendiente, Efectivo en cero).
    for (const a of propias) {
      const raw = saldos[a.id]?.trim()
      if (!raw) continue
      const cents = parseAmountToCents(raw)
      if (cents !== null) addAdjustment(a.id, cents)
    }
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
          <h1 className="text-2xl font-bold tracking-tight">Kumi</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Anota lo que gastas y mira en qué se te va el mes.
          </p>
        </div>
      </div>

      <div className="mx-auto flex gap-1.5" aria-hidden="true">
        <span className={`h-1.5 w-6 rounded-full transition-colors ${step === 'budget' ? 'bg-primary' : 'bg-muted'}`} />
        <span className={`h-1.5 w-6 rounded-full transition-colors ${step === 'balances' ? 'bg-primary' : 'bg-muted'}`} />
      </div>

      {step === 'budget' ? (
        <>
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
                  if (e.key === 'Enter' && valido) setStep('balances')
                }}
              />
            </div>

            <Button onClick={() => setStep('balances')} disabled={!valido} className="h-12">
              Continuar
            </Button>
          </section>

          <button
            onClick={() => setStep('balances')}
            className="mx-auto text-sm text-muted-foreground underline-offset-4 transition hover:underline"
          >
            Definirlo después
          </button>
        </>
      ) : (
        <section className="surface flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold">¿Cuánto tienes ahora?</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Míralo en el app de tu banco. Si dejas una cuenta en blanco, queda con
              saldo pendiente de configurar hasta que lo calibres desde Cuentas.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {propias.map((a) => (
              <div key={a.id} className="grid gap-1.5">
                <label
                  htmlFor={`saldo-${a.id}`}
                  className="text-xs font-medium text-muted-foreground"
                >
                  {a.name}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">S/</span>
                  <Input
                    id={`saldo-${a.id}`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={saldos[a.id] ?? ''}
                    onChange={(e) =>
                      setSaldos((s) => ({ ...s, [a.id]: sanitizeAmount(e.target.value) }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={empezar} className="h-12">
              Empezar
            </Button>
            {/* `valor`/`saldos` viven en el componente, no en el paso: volver
                no pierde lo tipeado en ninguno de los dos pasos. */}
            <Button variant="ghost" onClick={() => setStep('budget')}>
              Atrás
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
