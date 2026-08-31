import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategoryIcon } from '@/components/CategoryIcon'
import { addTransaction, getTransaction, updateTransaction, useData } from '@/lib/store'
import { centsToInput, parseAmountToCents, sanitizeAmount, todayISO } from '@/lib/format'
import { DEFAULT_ACCOUNT_ID } from '@/lib/backup'
import type { CategoryKind } from '@/types'

export function AddTransaction() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { accounts, categories } = useData()
  const existing = id ? getTransaction(id) : undefined
  const isEdit = Boolean(id)

  // Esta pantalla todavía es de 2 naturalezas; devolución y ajuste llegan con
  // el rediseño de Registrar.
  const [type, setType] = useState<CategoryKind>(existing?.nature === 'income' ? 'income' : 'expense')
  const [amount, setAmount] = useState(existing ? centsToInput(existing.amountCents) : '')
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '')
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [note, setNote] = useState(existing?.note ?? '')

  const cats = useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
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

  function submit() {
    const value = parseAmountToCents(amount)
    if (!value || value <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }
    if (!categoryId) {
      toast.error('Elige una categoría')
      return
    }
    const payload = {
      amountCents: value,
      categoryId,
      nature: type,
      // Sin selector de cuenta todavía: va a la primera, como todo el historial.
      accountId: existing?.accountId ?? accounts[0]?.id ?? DEFAULT_ACCOUNT_ID,
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
          {type === 'expense' ? 'Gasto' : 'Ingreso'}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setType('expense')
            setCategoryId('')
          }}
          className={`rounded-xl border-2 py-2.5 text-sm font-medium transition ${
            type === 'expense'
              ? 'border-rose-500 bg-rose-50 text-rose-600'
              : 'border-border text-muted-foreground'
          }`}
        >
          Gasto
        </button>
        <button
          onClick={() => {
            setType('income')
            setCategoryId('')
          }}
          className={`rounded-xl border-2 py-2.5 text-sm font-medium transition ${
            type === 'income'
              ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
              : 'border-border text-muted-foreground'
          }`}
        >
          Ingreso
        </button>
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
