import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategoryIcon } from '@/components/CategoryIcon'
import { centsToInput, parseAmountToCents, sanitizeAmount, todayISO } from '@/lib/format'
import { addReminder, deleteReminder, getReminder, updateReminder, useData } from '@/lib/store'
import type { Recurrence, Reminder, ReminderKind } from '@/types'

const KINDS: { id: ReminderKind; label: string; hint: string }[] = [
  { id: 'expense', label: 'Pago', hint: 'Luz, alquiler, la cuota' },
  { id: 'income', label: 'Ingreso', hint: 'Sueldo, una cobranza' },
]

const RECURRENCES: { id: Recurrence; label: string }[] = [
  { id: 'monthly', label: 'Cada mes' },
  { id: 'once', label: 'Una vez' },
]

/**
 * Crear y editar recordatorios (`/recordatorios/nuevo`, `/recordatorios/:id`).
 *
 * Acá se anota lo que TIENE FECHA: luz, internet, alquiler, la cuota de la
 * tarjeta, el sueldo. Comida y pasajes no — esos son ritmo y tope, y viven en
 * el presupuesto de su categoría (enmienda del ADR 0003).
 */
export function ReminderForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { categories } = useData()
  const existing = id ? getReminder(id) : undefined
  const isEdit = Boolean(id)

  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<ReminderKind>(existing?.kind ?? 'expense')
  const [recurrence, setRecurrence] = useState<Recurrence>(existing?.recurrence ?? 'monthly')
  const [day, setDay] = useState(String(existing?.day ?? ''))
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [amount, setAmount] = useState(
    existing?.amountCents === undefined ? '' : centsToInput(existing.amountCents),
  )
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '')

  const cats = categories.filter((c) => c.type === kind)

  if (isEdit && existing === undefined) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">Ese recordatorio ya no existe.</p>
        <Button onClick={() => navigate('/calendario', { replace: true })}>Ir al calendario</Button>
      </div>
    )
  }

  function submit() {
    const limpio = name.trim()
    if (!limpio) {
      toast.error('Ponle un nombre')
      return
    }
    const n = Number(day)
    if (recurrence === 'monthly' && !(Number.isInteger(n) && n >= 1 && n <= 31)) {
      toast.error('Elige un día del mes, del 1 al 31')
      return
    }
    // El monto es opcional a propósito: hay recibos que no se saben hasta que
    // llegan, y listarlos sin monto es más honesto que inventarles uno.
    const cents = amount.trim() === '' ? undefined : (parseAmountToCents(amount) ?? undefined)
    if (amount.trim() !== '' && cents === undefined) {
      toast.error('Ese monto no es válido')
      return
    }

    const campos: Omit<Reminder, 'id' | 'paidOn' | 'createdOn'> = {
      name: limpio,
      kind,
      recurrence,
      amountCents: cents,
      categoryId: categoryId || undefined,
      ...(recurrence === 'monthly' ? { day: n } : { date }),
    }

    if (isEdit && id) {
      // `day` y `date` se pisan los dos: al pasar de mensual a una vez, el día
      // viejo quedaría colgado y la ocurrencia saldría en dos lugares.
      updateReminder(id, { ...campos, day: undefined, date: undefined, ...campos })
      toast.success('Recordatorio actualizado')
    } else {
      addReminder(campos)
      toast.success(`${limpio} agregado al calendario`)
    }
    navigate('/calendario')
  }

  function borrar() {
    if (!id) return
    const previo = deleteReminder(id)
    toast.success('Recordatorio eliminado', {
      action: {
        label: 'Deshacer',
        onClick: () => {
          if (previo) addReminder(previo)
        },
      },
    })
    navigate('/calendario')
  }

  return (
    <div className="flex min-h-svh flex-col p-4 pt-nav">
      <header className="mb-5 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="Atrás"
          className="flex h-9 w-9 items-center justify-center rounded-full active:bg-muted"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold">
          {isEdit ? 'Editar recordatorio' : 'Nuevo recordatorio'}
        </h1>
      </header>

      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => {
                setKind(k.id)
                setCategoryId('')
              }}
              className={`flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition ${
                kind === k.id ? 'border-accent bg-accent/10' : 'border-border'
              }`}
            >
              <span className="text-sm font-medium">{k.label}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{k.hint}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            autoFocus={!isEdit}
            placeholder={kind === 'income' ? 'Ej. Sueldo' : 'Ej. Luz'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">¿Cada cuánto?</span>
          <div className="flex gap-2">
            {RECURRENCES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRecurrence(r.id)}
                className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition ${
                  recurrence === r.id
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {recurrence === 'monthly' ? (
          <div className="grid gap-2">
            <Label htmlFor="dia">Día del mes</Label>
            <Input
              id="dia"
              inputMode="numeric"
              placeholder="15"
              value={day}
              onChange={(e) => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))}
            />
            <p className="text-[11px] text-muted-foreground">
              Si eliges 31, en los meses que no lo tienen cae el último día.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="monto">Monto (opcional)</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">S/</span>
            <Input
              id="monto"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Déjalo vacío si no lo sabes hasta que llega. Se lista igual, pero no suma a
            tu disponible: no le inventamos un número.
          </p>
        </div>

        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Categoría (opcional)</span>
          <div className="grid grid-cols-4 gap-3">
            {cats.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition ${
                  categoryId === c.id
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/50'
                }`}
              >
                <CategoryIcon category={c} size="lg" />
                <span className="text-center text-[11px] leading-tight">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="mt-auto flex flex-col gap-2 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <Button size="lg" className="h-12 text-base" onClick={submit}>
          {isEdit ? 'Guardar cambios' : 'Agregar al calendario'}
        </Button>
        {isEdit ? (
          <Button variant="ghost" onClick={borrar} className="text-destructive">
            <Trash2 size={16} />
            Eliminar recordatorio
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => navigate(-1)}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  )
}
