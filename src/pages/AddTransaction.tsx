import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Landmark, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategoryIcon } from '@/components/CategoryIcon'
import { addTransaction, getTransaction, updateTransaction, useData } from '@/lib/store'
import { centsToInput, parseAmountToCents, sanitizeAmount, todayISO } from '@/lib/format'
import { DEFAULT_ACCOUNT_ID } from '@/lib/backup'
import type { Account, Medium, TxNature } from '@/types'

/** Las naturalezas que se eligen acá. El ajuste no: se crea desde Cuentas. */
type Nature = Exclude<TxNature, 'adjustment'>

const NATURES: { id: Nature; label: string; active: string }[] = [
  { id: 'expense', label: 'Gasto', active: 'border-rose-500 bg-rose-50 text-rose-600' },
  { id: 'income', label: 'Ingreso', active: 'border-emerald-500 bg-emerald-50 text-emerald-600' },
  { id: 'refund', label: 'Devolución', active: 'border-accent bg-accent text-accent-foreground' },
]

const MEDIA: { id: Medium; label: string }[] = [
  { id: 'yape', label: 'Yape' },
  { id: 'plin', label: 'Plin' },
  { id: 'card', label: 'Tarjeta' },
  { id: 'transfer', label: 'Transferencia' },
  { id: 'other', label: 'Otro' },
]

export function AddTransaction() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { accounts, categories, transactions } = useData()
  const existing = id ? getTransaction(id) : undefined
  const isEdit = Boolean(id)

  const initialNature: Nature =
    existing && existing.nature !== 'adjustment' ? existing.nature : 'expense'
  const [nature, setNature] = useState<Nature>(initialNature)
  const [amount, setAmount] = useState(existing ? centsToInput(existing.amountCents) : '')
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '')
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [note, setNote] = useState(existing?.note ?? '')
  // Cuenta: la del movimiento en edición, o la última usada (D1 del ADR).
  const [accountId, setAccountId] = useState(
    existing?.accountId ?? transactions[0]?.accountId ?? accounts[0]?.id ?? DEFAULT_ACCOUNT_ID,
  )
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]
  // Medio: el de la cuenta en edición, el último de la cuenta, o Yape por
  // defecto en una cuenta bancaria nueva — el caso común es Yape (ver ADR).
  const [medium, setMedium] = useState<Medium | undefined>(
    existing?.medium ?? account?.lastMedium ?? (account?.kind === 'bank' ? 'yape' : undefined),
  )

  // La devolución usa las categorías de gasto: resta de ese gasto, no es un ingreso.
  const cats = useMemo(
    () => categories.filter((c) => c.type === (nature === 'income' ? 'income' : 'expense')),
    [categories, nature],
  )

  // El movimiento fue borrado desde otra pantalla mientras estabas acá.
  if (isEdit && !existing) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">Ese movimiento ya no existe.</p>
        <Button onClick={() => navigate('/', { replace: true })}>Volver al resumen</Button>
      </div>
    )
  }

  // El ajuste no es un gasto ni un ingreso (ver CONTEXT.md): se edita desde Cuentas.
  if (isEdit && existing?.nature === 'adjustment') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">Los ajustes se editan desde Cuentas.</p>
        <Button onClick={() => navigate('/cuentas', { replace: true })}>Ir a Cuentas</Button>
      </div>
    )
  }

  function selectAccount(a: Account) {
    setAccountId(a.id)
    setMedium(a.lastMedium ?? (a.kind === 'bank' ? 'yape' : undefined))
  }

  function submit() {
    const cents = parseAmountToCents(amount)
    if (!cents || cents <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }
    if (!categoryId) {
      toast.error('Elige una categoría')
      return
    }

    const payload = {
      amountCents: cents,
      nature,
      accountId,
      categoryId,
      medium: account?.kind === 'bank' ? medium : undefined,
      date,
      note: note.trim() || undefined,
    }
    if (isEdit && id) {
      updateTransaction(id, payload)
      toast.success('Movimiento actualizado')
    } else {
      addTransaction(payload)
      toast.success('Movimiento guardado')
    }
    navigate('/')
  }

  return (
    <div className="flex min-h-svh flex-col p-4 pt-nav">
      <header className="mb-4 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="Atrás"
          className="flex h-9 w-9 items-center justify-center rounded-full active:bg-muted"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold">
          {isEdit ? 'Editar movimiento' : 'Registrar movimiento'}
        </h1>
      </header>

      <div className="mb-5 flex flex-col items-center">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-medium text-muted-foreground">S/</span>
          <input
            autoFocus
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
            placeholder="0.00"
            aria-label="Monto"
            className="w-48 bg-transparent text-center text-5xl font-bold tabular-nums outline-none placeholder:text-muted-foreground/40"
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {NATURES.find((n) => n.id === nature)?.label}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-2">
        {NATURES.map((n) => (
          <button
            key={n.id}
            onClick={() => {
              setNature(n.id)
              setCategoryId('')
            }}
            className={`rounded-xl border-2 py-2.5 text-sm font-medium transition ${
              nature === n.id ? n.active : 'border-border text-muted-foreground'
            }`}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategoryId(c.id)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition ${
              categoryId === c.id ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/50'
            }`}
          >
            <CategoryIcon category={c} size="lg" />
            <span className="text-center text-[11px] leading-tight">{c.name}</span>
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-col gap-2.5">
        <span className="text-xs font-medium text-muted-foreground">Cuenta</span>
        <div className="flex gap-2">
          {accounts.map((a) => (
            <button
              key={a.id}
              onClick={() => selectAccount(a)}
              className={`flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition ${
                accountId === a.id
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {a.kind === 'bank' ? <Landmark size={15} /> : <Wallet size={15} />}
              {a.name}
            </button>
          ))}
        </div>

        {account?.kind === 'bank' && (
          <div className="flex flex-wrap gap-1.5">
            {MEDIA.map((m) => (
              <button
                key={m.id}
                onClick={() => setMedium(m.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  medium === m.id
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="date">Fecha</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="note">Nota (opcional)</Label>
          <Input
            id="note"
            placeholder="Ej. Almuerzo con equipo"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div
        className="mt-auto flex flex-col gap-2 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <Button size="lg" className="h-12 text-base" onClick={submit}>
          {isEdit ? 'Guardar cambios' : 'Guardar'}
        </Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
