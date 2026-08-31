import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CircleAlert, Landmark, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatMoney, sanitizeAmount } from '@/lib/format'

const LINK = '#2a78d6'

interface MockAccount {
  id: string
  name: string
  kind: 'bank' | 'cash'
  balance: number
  pending?: boolean
}

/** Datos de ejemplo: en Fase B esto sale de `useData().accounts`. */
const SEED_ACCOUNTS: MockAccount[] = [
  { id: 'a_bcp', name: 'BCP', kind: 'bank', balance: 2843.5 },
  { id: 'a_cash', name: 'Efectivo', kind: 'cash', balance: 0, pending: true },
]

/**
 * Lista de cuentas con su saldo y un ajuste manual para calibrarlo contra la
 * realidad. El ajuste nunca es un gasto ni un ingreso (ver CONTEXT.md): solo
 * corrige el saldo, así que no toca presupuesto ni análisis. Se llega acá
 * desde la tarjeta "En cuentas" del Resumen, no desde la barra inferior.
 */
export function Accounts() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState(SEED_ACCOUNTS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [target, setTarget] = useState('')

  const total = accounts.reduce((s, a) => s + a.balance, 0)
  const confiable = accounts.every((a) => !a.pending)

  function startEdit(a: MockAccount) {
    setEditingId(a.id)
    setTarget(a.pending ? '' : String(a.balance))
  }

  function confirmAdjust(a: MockAccount) {
    if (target.trim() === '') {
      toast.error('Ingresa el saldo real')
      return
    }
    const nuevo = Number(target)
    if (!Number.isFinite(nuevo) || nuevo < 0) {
      toast.error('Ingresa un saldo válido')
      return
    }
    const delta = nuevo - (a.pending ? 0 : a.balance)
    setAccounts((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, balance: nuevo, pending: false } : x)),
    )
    toast.success(
      delta === 0
        ? `Saldo confirmado en ${formatMoney(nuevo)}`
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
        <span className="text-[2.25rem] font-bold leading-none tracking-tight tabular-nums">
          {formatMoney(total)}
        </span>
        {!confiable && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
            <CircleAlert size={14} />
            No es exacto: hay una cuenta con saldo pendiente de configurar.
          </p>
        )}
      </section>

      <section className="surface flex flex-col divide-y divide-border p-1">
        {accounts.map((a) => (
          <div key={a.id} className="flex flex-col p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                {a.kind === 'bank' ? <Landmark size={18} /> : <Wallet size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.name}</p>
                {a.pending ? (
                  <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-600 uppercase">
                    Pendiente de configurar
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Saldo calibrado</span>
                )}
              </div>
              <span className="shrink-0 text-lg font-semibold tabular-nums">
                {a.pending ? '—' : formatMoney(a.balance)}
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
        ))}
      </section>
    </div>
  )
}
