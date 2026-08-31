import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleAlert, Landmark, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { centsToInput, formatMoney, parseAmountToCents, sanitizeAmount } from '@/lib/format'
import { accountBalanceCents, addAdjustment, totalInAccounts, useData } from '@/lib/store'
import type { Account } from '@/types'

const LINK = '#2a78d6'

/**
 * Lista de cuentas con su saldo y un ajuste manual para calibrarlo contra la
 * realidad. El ajuste nunca es un gasto ni un ingreso (ver CONTEXT.md): solo
 * corrige el saldo, así que no toca presupuesto ni análisis. Se llega acá
 * desde la tarjeta "En cuentas" del Resumen, no desde la barra inferior.
 */
export function Accounts() {
  const navigate = useNavigate()
  const { accounts } = useData()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [target, setTarget] = useState('')

  const { totalCents, reliable } = totalInAccounts()
  const sinCalibrar = accounts.filter((a) => a.balancePending).length
  // Un total en S/ 0.00 sin ser confiable es indistinguible de "no sabemos
  // nada todavía" (ej. BCP pendiente + Efectivo en cero): el primer estado
  // real de casi todo usuario. Ahí no mostramos el número, pedimos calibrar.
  const sinDatos = !reliable && totalCents === 0

  function startEdit(a: Account) {
    setEditingId(a.id)
    setTarget(a.balancePending ? '' : centsToInput(accountBalanceCents(a.id)))
  }

  function confirmAdjust(a: Account) {
    if (target.trim() === '') {
      toast.error('Ingresa el saldo real')
      return
    }
    const cents = parseAmountToCents(target)
    if (cents === null || cents < 0) {
      toast.error('Ingresa un saldo válido')
      return
    }
    const delta = cents - accountBalanceCents(a.id)
    addAdjustment(a.id, cents)
    toast.success(
      delta === 0
        ? `Saldo confirmado en ${formatMoney(cents)}`
        : `Ajuste registrado · ${delta > 0 ? '+' : ''}${formatMoney(delta)}`,
    )
    setEditingId(null)
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-nav">
      <header className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="Atrás"
          className="flex h-9 w-9 items-center justify-center rounded-full active:bg-muted"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold">Cuentas</h1>
      </header>

      <section className="surface flex flex-col gap-1 p-5">
        <span className="text-sm text-muted-foreground">En cuentas</span>
        {sinDatos ? (
          <>
            <p className="mt-1 text-xl font-bold tracking-tight">Falta calibrar tus cuentas</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Todavía no sabemos cuánto tienes: ajusta el saldo de al menos una cuenta
              para empezar a ver tu total.
            </p>
            <Button
              onClick={() => startEdit(accounts.find((a) => a.balancePending) ?? accounts[0])}
              className="mt-3 h-10 self-start"
            >
              Calibrar cuentas
            </Button>
          </>
        ) : (
          <>
            <span className="text-[2.25rem] font-bold leading-none tracking-tight tabular-nums">
              {formatMoney(totalCents)}
            </span>
            {!reliable && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
                <CircleAlert size={14} />
                No incluye {sinCalibrar === 1 ? 'la cuenta' : 'las cuentas'} sin calibrar.
              </p>
            )}
          </>
        )}
      </section>

      <section className="surface flex flex-col divide-y divide-border p-1">
        {accounts.map((a) => {
          const balance = accountBalanceCents(a.id)
          return (
            <div key={a.id} className="flex flex-col p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                  {a.kind === 'bank' ? <Landmark size={18} /> : <Wallet size={18} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.name}</p>
                  {a.balancePending ? (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-600 uppercase">
                      Pendiente de configurar
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Saldo calibrado</span>
                  )}
                </div>
                <span className="shrink-0 text-lg font-semibold tabular-nums">
                  {a.balancePending ? '—' : formatMoney(balance)}
                </span>
              </div>

              {editingId === a.id ? (
                <div className="mt-3 flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
                  <label htmlFor={`target-${a.id}`} className="text-xs text-muted-foreground">
                    ¿Cuánto tienes en {a.name} ahora?
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">S/</span>
                    <Input
                      id={`target-${a.id}`}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={target}
                      onChange={(e) => setTarget(sanitizeAmount(e.target.value))}
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Esto crea un ajuste, no un gasto ni un ingreso: solo calibra el saldo
                    con la realidad.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => confirmAdjust(a)} className="h-9 flex-1">
                      Guardar ajuste
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-9">
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => startEdit(a)}
                  className="mt-3 self-start text-sm font-medium"
                  style={{ color: LINK }}
                >
                  Ajustar saldo
                </button>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
