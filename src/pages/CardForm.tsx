import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CreditCard, Landmark, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BRANDS, ISSUERS } from '@/lib/issuers'
import { centsToInput, parseAmountToCents, sanitizeAmount } from '@/lib/format'
import {
  addCreditCard,
  addDebitCard,
  deleteCard,
  getAccount,
  getCard,
  getData,
  replaceData,
  updateAccount,
  updateCard,
  useData,
} from '@/lib/store'
import type { CardBrand, CardKind } from '@/types'

const KINDS: { id: CardKind; label: string; hint: string }[] = [
  { id: 'debit', label: 'Débito', hint: 'Saca de una cuenta tuya' },
  { id: 'credit', label: 'Crédito', hint: 'Acumula deuda con el banco' },
]

/** Solo dígitos, máximo dos: son días del mes, no montos. */
function sanitizeDay(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 2)
}

function parseDay(raw: string): number | undefined {
  const n = Number(raw)
  return raw !== '' && Number.isInteger(n) && n >= 1 && n <= 31 ? n : undefined
}

/**
 * Crear y editar tarjetas (`/tarjetas/nueva`, `/tarjetas/:id`).
 *
 * La asimetría del modelo (ADR 0004) queda escondida acá adentro: el usuario
 * llena un solo formulario y, si es de crédito, el store crea también su cuenta
 * de deuda. Los campos de plata (línea, cierre, vencimiento) viven en esa
 * cuenta; los de identidad (nombre, marca, últimos cuatro), en la tarjeta.
 */
export function CardForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { accounts } = useData()
  const existing = id ? getCard(id) : undefined
  const isEdit = Boolean(id)
  const cuenta = existing ? getAccount(existing.accountId) : undefined

  const bancos = accounts.filter((a) => a.kind === 'bank')

  const [kind, setKind] = useState<CardKind>(existing?.kind ?? 'credit')
  const [name, setName] = useState(existing?.name ?? '')
  const [brand, setBrand] = useState<CardBrand | undefined>(existing?.brand)
  const [last4, setLast4] = useState(existing?.last4 ?? '')
  const [accountId, setAccountId] = useState(
    existing?.kind === 'debit' ? existing.accountId : (bancos[0]?.id ?? ''),
  )
  const [issuer, setIssuer] = useState(cuenta?.issuer ?? '')
  const [limit, setLimit] = useState(
    cuenta?.creditLimitCents === undefined ? '' : centsToInput(cuenta.creditLimitCents),
  )
  const [closingDay, setClosingDay] = useState(String(cuenta?.closingDay ?? ''))
  const [dueDay, setDueDay] = useState(String(cuenta?.dueDay ?? ''))

  if (isEdit && existing === undefined) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">Esa tarjeta ya no existe.</p>
        <Button onClick={() => navigate('/cuentas', { replace: true })}>Ir a Cuentas</Button>
      </div>
    )
  }

  function submit() {
    const limpio = name.trim()
    if (!limpio) {
      toast.error('Ponle un nombre a la tarjeta')
      return
    }
    const limitCents = limit.trim() === '' ? undefined : (parseAmountToCents(limit) ?? undefined)
    if (limit.trim() !== '' && limitCents === undefined) {
      toast.error('Esa línea no es un monto válido')
      return
    }

    if (isEdit && existing) {
      updateCard(existing.id, { name: limpio, brand, last4: last4 || undefined })
      // El nombre vive en los dos: la cuenta de deuda se llama como su tarjeta.
      if (existing.kind === 'credit') {
        updateAccount(existing.accountId, {
          name: limpio,
          issuer: issuer.trim() || undefined,
          creditLimitCents: limitCents,
          closingDay: parseDay(closingDay),
          dueDay: parseDay(dueDay),
        })
      }
      toast.success('Tarjeta actualizada')
      navigate('/cuentas')
      return
    }

    if (kind === 'debit') {
      if (addDebitCard({ name: limpio, accountId, brand, last4: last4 || undefined }) === null) {
        toast.error('Elige la cuenta de la que saca esta tarjeta')
        return
      }
      toast.success(`${limpio} agregada`)
    } else {
      addCreditCard({
        name: limpio,
        issuer: issuer.trim() || undefined,
        brand,
        last4: last4 || undefined,
        creditLimitCents: limitCents,
        closingDay: parseDay(closingDay),
        dueDay: parseDay(dueDay),
      })
      toast.success(`${limpio} agregada · ajusta cuánto debes hoy`)
    }
    navigate('/cuentas')
  }

  function borrar() {
    if (!existing) return
    const previo = getData()
    if (deleteCard(existing.id) === 'has-transactions') {
      toast.error('Tiene movimientos', {
        description: 'Borrarla movería una deuda tuya. Quita primero sus movimientos.',
      })
      return
    }
    toast.success('Tarjeta eliminada', {
      action: { label: 'Deshacer', onClick: () => replaceData(previo) },
    })
    navigate('/cuentas')
  }

  const esCredito = (isEdit ? existing?.kind : kind) === 'credit'

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
        <h1 className="text-lg font-semibold">{isEdit ? 'Editar tarjeta' : 'Nueva tarjeta'}</h1>
      </header>

      <div className="flex flex-col gap-5">
        {!isEdit && (
          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className={`flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition ${
                    kind === k.id ? 'border-accent bg-accent/10' : 'border-border'
                  }`}
                >
                  {k.id === 'debit' ? (
                    <Landmark size={18} className="text-muted-foreground" />
                  ) : (
                    <CreditCard size={18} className="text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{k.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{k.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {kind === 'debit'
                ? 'No tiene saldo propio: la plata es la de su cuenta. Es una llave, no un lugar donde vive el dinero.'
                : 'Guarda deuda, no plata tuya. Nunca suma a «En cuentas» — su línea libre es dinero del banco.'}
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            autoFocus={!isEdit}
            placeholder={esCredito ? 'Ej. Visa BCP' : 'Ej. Débito BCP'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {!esCredito && !isEdit && (
          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground">Saca de</span>
            {bancos.length === 0 ? (
              <p className="rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                Primero crea una cuenta de banco: una tarjeta de débito es la llave de
                una cuenta, y sin cuenta no hay nada que abrir.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {bancos.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAccountId(a.id)}
                    className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition ${
                      accountId === a.id
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <span className="text-xs font-medium text-muted-foreground">Marca (opcional)</span>
          <div className="flex flex-wrap gap-1.5">
            {BRANDS.map((b) => (
              <button
                key={b.id}
                onClick={() => setBrand(brand === b.id ? undefined : b.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  brand === b.id
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="last4">Últimos 4 dígitos (opcional)</Label>
          <Input
            id="last4"
            inputMode="numeric"
            placeholder="4821"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <p className="text-[11px] text-muted-foreground">
            Solo para reconocerla. Kumi nunca guarda el número completo.
          </p>
        </div>

        {esCredito && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="emisor">Banco (opcional)</Label>
              <Input
                id="emisor"
                placeholder="Ej. BCP"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
              <div className="flex flex-wrap gap-1.5">
                {ISSUERS.map((b) => (
                  <button
                    key={b}
                    onClick={() => setIssuer(b)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      issuer === b
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="linea">Línea aprobada (opcional)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">S/</span>
                <Input
                  id="linea"
                  inputMode="decimal"
                  placeholder="6000.00"
                  value={limit}
                  onChange={(e) => setLimit(sanitizeAmount(e.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="cierre">Día de cierre</Label>
                <Input
                  id="cierre"
                  inputMode="numeric"
                  placeholder="5"
                  value={closingDay}
                  onChange={(e) => setClosingDay(sanitizeDay(e.target.value))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pago">Día de pago</Label>
                <Input
                  id="pago"
                  inputMode="numeric"
                  placeholder="22"
                  value={dueDay}
                  onChange={(e) => setDueDay(sanitizeDay(e.target.value))}
                />
              </div>
            </div>
            <p className="-mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Los dos están en tu estado de cuenta. El cierre define qué consumos entran
              a cada facturación; el de pago, cuándo vence. Todavía no se usan para
              calcular — llegan con el ciclo de la tarjeta.
            </p>
          </>
        )}
      </div>

      <div
        className="mt-auto flex flex-col gap-2 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <Button
          size="lg"
          className="h-12 text-base"
          onClick={submit}
          disabled={!isEdit && kind === 'debit' && bancos.length === 0}
        >
          {isEdit ? 'Guardar cambios' : 'Agregar tarjeta'}
        </Button>
        {isEdit ? (
          <Button variant="ghost" onClick={borrar} className="text-destructive">
            <Trash2 size={16} />
            Eliminar tarjeta
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
