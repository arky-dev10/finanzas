import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, CreditCard, Landmark, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategoryIcon } from '@/components/CategoryIcon'
import {
  addTransaction,
  cardsForAccount,
  getTransaction,
  lastUsedAccountId,
  updateTransaction,
  useData,
  walletFor,
} from '@/lib/store'
import { centsToInput, formatMoney, parseAmountToCents, sanitizeAmount, todayISO } from '@/lib/format'
import { installmentCents } from '@/lib/cards'
import { DEFAULT_ACCOUNT_ID } from '@/lib/backup'
import type { Account, Medium, TxNature } from '@/types'

const ACCOUNT_ICON = { bank: Landmark, cash: Wallet, credit: CreditCard } as const

/** Los planes que ofrecen los bancos en Perú. El 3 y el 12 son los de siempre. */
const CUOTAS = [3, 6, 9, 12, 18, 24]

/** Las naturalezas que se eligen acá. El ajuste no: se crea desde Cuentas. */
type Nature = Exclude<TxNature, 'adjustment'>

/*
 * Las tres primeras son plata que entra o sale de tu vida. La transferencia no
 * es ninguna de esas —la plata sigue siendo tuya, solo cambió de lugar— y por
 * eso va aparte, en su propia fila, en vez de como una cuarta hermana.
 */
const NATURES: { id: Nature; label: string; active: string }[] = [
  { id: 'expense', label: 'Gasto', active: 'border-rose-500 bg-rose-50 text-rose-600' },
  { id: 'income', label: 'Ingreso', active: 'border-emerald-500 bg-emerald-50 text-emerald-600' },
  { id: 'refund', label: 'Devolución', active: 'border-accent bg-accent text-accent-foreground' },
]

const TRANSFER_ACTIVE = 'border-sky-500 bg-sky-50 text-sky-700'

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
  const [params] = useSearchParams()
  const { accounts, categories } = useData()
  const existing = id ? getTransaction(id) : undefined
  const isEdit = Boolean(id)

  /*
   * «Pagar» desde una tarjeta llega acá con el destino y el monto puestos, pero
   * como un formulario normal y no como un atajo que registra solo: pagar es
   * mover plata de verdad, y el monto casi nunca es exactamente el sugerido
   * (pago parcial, o el estado de cuenta que llegó distinto).
   */
  const pagando = accounts.find((a) => a.id === params.get('pagar') && a.kind === 'credit')
  const montoSugerido = Number(params.get('monto'))

  const initialNature: Nature =
    existing && existing.nature !== 'adjustment' ? existing.nature : 'expense'
  const [nature, setNature] = useState<Nature>(pagando ? 'transfer' : initialNature)
  const esTransferencia = nature === 'transfer'
  const [amount, setAmount] = useState(
    existing
      ? centsToInput(existing.amountCents)
      : pagando && Number.isInteger(montoSugerido) && montoSugerido > 0
        ? centsToInput(montoSugerido)
        : '',
  )
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '')
  const [date, setDate] = useState(existing?.date ?? todayISO())
  const [note, setNote] = useState(existing?.note ?? '')
  // Cuenta: la del movimiento en edición, o la última usada (D1 del ADR 0001).
  const [accountId, setAccountId] = useState(
    existing?.accountId ??
      // Pagando una tarjeta, el origen tiene que ser una cuenta con plata: la
      // última usada puede ser la tarjeta misma, y pagarse a sí misma no es nada.
      (pagando ? origenParaPagar(accounts, pagando.id) : lastUsedAccountId()) ??
      accounts[0]?.id ??
      DEFAULT_ACCOUNT_ID,
  )
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0]
  // Medio: el de la cuenta en edición, el último de la cuenta, o Yape por
  // defecto en una cuenta bancaria nueva — el caso común es Yape (ver ADR).
  const [medium, setMedium] = useState<Medium | undefined>(
    existing?.medium ?? defaultMedium(account),
  )
  const [cardId, setCardId] = useState<string | undefined>(existing?.cardId)
  const [toAccountId, setToAccountId] = useState<string | undefined>(
    existing?.toAccountId ?? pagando?.id,
  )
  const [installmentCount, setInstallmentCount] = useState<number | undefined>(
    existing?.installmentCount,
  )

  // Las tarjetas que abren la cuenta elegida. En una de crédito es una sola —
  // la suya— y no hay nada que elegir; en un banco pueden ser varias.
  const tarjetas = cardsForAccount(accountId).filter((c) => c.kind === 'debit')
  const destino = accounts.find((a) => a.id === toAccountId)
  // Las cuotas son cosa de la tarjeta de crédito: en efectivo o en débito la
  // plata sale entera y no hay nada que repartir.
  const enCuotas = account?.kind === 'credit' && nature === 'expense'
  const centavos = parseAmountToCents(amount)
  const cuotaSugerida =
    installmentCount === undefined || centavos === null || centavos <= 0
      ? null
      : installmentCents(centavos, installmentCount, 0)

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
    setMedium(a.lastMedium ?? defaultMedium(a))
    // La tarjeta de la cuenta anterior no abre esta: se cae con el cambio. En
    // una de crédito la tarjeta es la suya y no hay nada que elegir.
    setCardId(a.kind === 'credit' ? cardsForAccount(a.id)[0]?.id : undefined)
    // Si el nuevo origen era el destino, la transferencia se volvería sobre sí
    // misma: se suelta el destino y el usuario elige de nuevo.
    if (a.id === toAccountId) setToAccountId(undefined)
    if (a.kind !== 'credit') setInstallmentCount(undefined)
  }

  /**
   * Elegir Yape o Plin también elige la cuenta, si el usuario declaró de dónde
   * sale (ADR 0004, D9): con dos bancos, "pagué por Yape" no dice de cuál salió.
   * Sin billetera declarada no toca nada — no adivina por él.
   */
  function selectMedium(m: Medium) {
    setMedium(m)
    if (m !== 'yape' && m !== 'plin') return
    const wallet = walletFor(m)
    if (wallet === undefined || wallet.accountId === accountId) return
    setAccountId(wallet.accountId)
    setCardId(undefined)
  }

  function submit() {
    const cents = parseAmountToCents(amount)
    if (!cents || cents <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }
    if (!esTransferencia && !categoryId) {
      toast.error('Elige una categoría')
      return
    }
    if (esTransferencia && !toAccountId) {
      toast.error('Elige a qué cuenta va')
      return
    }

    const payload = {
      amountCents: cents,
      nature,
      accountId,
      // El store normaliza igual, pero mandar la categoría de un gasto pegada a
      // una transferencia sería confiar en que el de abajo la limpie.
      categoryId: esTransferencia ? undefined : categoryId,
      toAccountId: esTransferencia ? toAccountId : undefined,
      medium: account?.kind === 'cash' ? undefined : medium,
      cardId,
      // Solo un gasto con tarjeta de crédito se paga en cuotas; el store lo
      // normaliza igual, pero mandar un plan que no aplica sería mentirle.
      installmentCount: enCuotas ? installmentCount : undefined,
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
          {esTransferencia ? 'Transferencia' : NATURES.find((n) => n.id === nature)?.label}
        </p>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2">
        {NATURES.filter((n) => n.id !== 'transfer').map((n) => (
          <button
            key={n.id}
            onClick={() => {
              setNature(n.id)
              setCategoryId('')
              if (n.id !== 'expense') setInstallmentCount(undefined)
            }}
            className={`rounded-xl border-2 py-2.5 text-sm font-medium transition ${
              nature === n.id ? n.active : 'border-border text-muted-foreground'
            }`}
          >
            {n.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => {
          setNature('transfer')
          setCategoryId('')
          setInstallmentCount(undefined)
        }}
        className={`mb-5 flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-medium transition ${
          esTransferencia ? TRANSFER_ACTIVE : 'border-border text-muted-foreground'
        }`}
      >
        <ArrowLeftRight size={16} />
        Transferencia
      </button>

      <div className={`mb-5 grid grid-cols-4 gap-3 ${esTransferencia ? 'hidden' : ''}`}>
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
        <span className="text-xs font-medium text-muted-foreground">
          {esTransferencia ? 'Sale de' : 'Cuenta o tarjeta'}
        </span>
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => {
            const Icon = ACCOUNT_ICON[a.kind]
            return (
              <button
                key={a.id}
                onClick={() => selectAccount(a)}
                className={`flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition ${
                  accountId === a.id
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                <Icon size={15} />
                {a.name}
              </button>
            )
          })}
        </div>

        {esTransferencia && (
          <>
            <span className="mt-1 text-xs font-medium text-muted-foreground">Entra a</span>
            <div className="flex flex-wrap gap-2">
              {/* La cuenta de origen no está: mover plata a sí misma no es nada. */}
              {accounts
                .filter((a) => a.id !== accountId)
                .map((a) => {
                  const Icon = ACCOUNT_ICON[a.kind]
                  return (
                    <button
                      key={a.id}
                      onClick={() => setToAccountId(a.id)}
                      className={`flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition ${
                        toAccountId === a.id
                          ? 'border-sky-500 bg-sky-50 text-sky-700'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <Icon size={15} />
                      {a.name}
                    </button>
                  )
                })}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {destino?.kind === 'credit'
                ? 'Baja tu deuda con esa tarjeta. No cuenta como gasto: lo que compraste ya se contó el día que lo compraste.'
                : 'No es gasto ni ingreso: la plata sigue siendo tuya, solo cambia de lugar. No toca tu presupuesto.'}
            </p>
          </>
        )}

        {/* En una tarjeta de crédito no hay medio que elegir —fue con la tarjeta—
            y el gasto no sale de una cuenta: sube la deuda. Vale decirlo acá, que
            es donde el usuario está por confirmarlo. */}
        {account?.kind === 'credit' && !esTransferencia && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {nature === 'expense'
              ? 'Cuenta como gasto hoy, con su categoría, y suma a tu deuda. Pagar la tarjeta después no vuelve a contarlo.'
              : 'Baja tu deuda con esta tarjeta.'}
          </p>
        )}

        {account?.kind === 'bank' && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {MEDIA.map((m) => (
                <button
                  key={m.id}
                  onClick={() => selectMedium(m.id)}
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

            {medium === 'card' && tarjetas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tarjetas.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCardId(cardId === c.id ? undefined : c.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      cardId === c.id
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {c.name}
                    {c.last4 === undefined ? '' : ` •${c.last4}`}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {enCuotas && (
        <div className="mb-5 flex flex-col gap-2.5">
          <span className="text-xs font-medium text-muted-foreground">En cuotas</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setInstallmentCount(undefined)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                installmentCount === undefined
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border text-muted-foreground'
              }`}
            >
              Sin cuotas
            </button>
            {CUOTAS.map((n) => (
              <button
                key={n}
                onClick={() => setInstallmentCount(n)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  installmentCount === n
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {installmentCount !== undefined && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {cuotaSugerida === null
                ? `Se reparte en ${installmentCount} cuotas.`
                : `${installmentCount} cuotas de ${formatMoney(cuotaSugerida)}. Debes el total desde hoy, pero tu presupuesto del mes solo siente la cuota.`}
            </p>
          )}
        </div>
      )}

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

/**
 * Yape en una cuenta bancaria (el caso común, ver ADR 0001) y tarjeta en una de
 * crédito, donde no hay otra forma de haber pagado. El efectivo no lleva medio:
 * la plata en mano no se mueve por un canal.
 */
function defaultMedium(account: Account | undefined): Medium | undefined {
  if (account?.kind === 'bank') return 'yape'
  return account?.kind === 'credit' ? 'card' : undefined
}

/**
 * De qué cuenta se paga una tarjeta. La última usada sirve solo si es una
 * cuenta con plata: si fue la tarjeta misma, pagarse a sí misma no es nada.
 */
function origenParaPagar(accounts: Account[], cardAccountId: string): string | undefined {
  const ultima = lastUsedAccountId()
  const sirve = (id: string | undefined) =>
    id !== undefined && id !== cardAccountId && accounts.find((a) => a.id === id)?.kind !== 'credit'
  if (sirve(ultima)) return ultima
  return accounts.find((a) => a.kind === 'bank')?.id ?? accounts.find((a) => a.kind === 'cash')?.id
}
