import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarClock,
  CircleAlert,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brandLabel } from '@/lib/issuers'
import {
  centsToInput,
  formatDate,
  formatMoney,
  parseAmountToCents,
  sanitizeAmount,
  todayISO,
} from '@/lib/format'
import { dueLabel } from '@/lib/cards'
import {
  accountBalanceCents,
  accountDebtCents,
  addAdjustment,
  addWallet,
  cardsForAccount,
  confirmStatement,
  creditAvailableCents,
  creditCardStatus,
  type CardStatus,
  deleteWallet,
  getAccount,
  totalDebtCents,
  totalInAccounts,
  useData,
} from '@/lib/store'
import type { Account, Card, Wallet as Billetera, WalletProvider } from '@/types'

const LINK = '#2a78d6'

/**
 * Todo el dinero del usuario en una pantalla: cuentas (donde vive la plata),
 * tarjetas (llaves, y en crédito también deuda) y las billeteras Yape/Plin con
 * su origen declarado.
 *
 * Están juntas porque el modelo las tiene entrelazadas —una tarjeta de débito
 * cuelga de una cuenta, una de crédito ES una cuenta— y separarlas en pantallas
 * obligaría a rebotar entre las dos para entender de dónde sale la plata.
 */
export function Accounts() {
  const navigate = useNavigate()
  const { accounts, cards, wallets } = useData()

  const propias = accounts.filter((a) => a.kind !== 'credit')
  const creditos = cards.filter((c) => c.kind === 'credit')
  const debitos = cards.filter((c) => c.kind === 'debit')

  const { totalCents, reliable } = totalInAccounts()
  const deuda = totalDebtCents()
  const sinCalibrar = propias.filter((a) => a.balancePending).length
  const sinDeudaCalibrada = accounts.filter((a) => a.kind === 'credit' && a.balancePending).length
  // Un total en S/ 0.00 sin ser confiable es indistinguible de "no sabemos
  // nada todavía" (ej. BCP pendiente + Efectivo en cero): el primer estado
  // real de casi todo usuario. Ahí no mostramos el número, pedimos calibrar.
  const sinDatos = !reliable && totalCents === 0

  return (
    <div className="flex flex-col gap-5 px-4 pb-4 pt-nav">
      <header className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          aria-label="Atrás"
          className="flex h-9 w-9 items-center justify-center rounded-full active:bg-muted"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold">Cuentas y tarjetas</h1>
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

        {creditos.length > 0 && (
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Debes</span>
              <span className="text-[10px] text-muted-foreground">
                No está descontado: es deuda, no plata tuya
              </span>
            </div>
            <span className="text-xl font-semibold tabular-nums text-rose-600">
              {deuda.reliable || deuda.totalCents !== 0 ? formatMoney(deuda.totalCents) : '—'}
            </span>
          </div>
        )}

        {creditos.length > 0 && !deuda.reliable && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600">
            <CircleAlert size={14} />
            No incluye {sinDeudaCalibrada === 1 ? 'la tarjeta' : 'las tarjetas'} sin calibrar.
          </p>
        )}
      </section>

      <Section title="Cuentas" onAdd={() => navigate('/cuentas/nueva')}>
        {propias.map((a) => (
          <AccountRow key={a.id} account={a} cards={cardsForAccount(a.id)} />
        ))}
      </Section>

      <Section title="Tarjetas" onAdd={() => navigate('/tarjetas/nueva')}>
        {cards.length === 0 ? (
          <Empty>
            Carga tus tarjetas para elegirlas al registrar. Las de crédito además llevan
            su deuda, su línea y su ciclo.
          </Empty>
        ) : (
          <>
            {creditos.map((c) => (
              <CreditRow key={c.id} card={c} />
            ))}
            {debitos.map((c) => (
              <DebitRow key={c.id} card={c} />
            ))}
          </>
        )}
      </Section>

      <WalletSection wallets={wallets} accounts={accounts} cards={debitos} />
    </div>
  )
}

/* ---------- piezas ---------- */

function Section({
  title,
  onAdd,
  children,
}: {
  title: string
  onAdd: () => void
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 text-sm font-medium"
          style={{ color: LINK }}
        >
          <Plus size={15} />
          Agregar
        </button>
      </div>
      <div className="surface flex flex-col divide-y divide-border p-1">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-xs leading-relaxed text-muted-foreground">{children}</p>
}

/** "visa •4821", o solo una de las dos si falta la otra. */
function cardTag(card: Card): string | undefined {
  const marca = brandLabel(card.brand)
  const cola = card.last4 === undefined ? undefined : `•${card.last4}`
  return [marca, cola].filter(Boolean).join(' ') || undefined
}

function AccountRow({ account, cards }: { account: Account; cards: Card[] }) {
  const navigate = useNavigate()
  const balance = accountBalanceCents(account.id)
  const llaves = cards.filter((c) => c.kind === 'debit')

  return (
    <div className="flex flex-col p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
          {account.kind === 'bank' ? <Landmark size={18} /> : <Wallet size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{account.name}</p>
          {account.balancePending ? (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-600 uppercase">
              Pendiente de configurar
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              {llaves.length === 0
                ? 'Saldo calibrado'
                : llaves.map((c) => c.name).join(' · ')}
            </span>
          )}
        </div>
        <span className="shrink-0 text-lg font-semibold tabular-nums">
          {account.balancePending ? '—' : formatMoney(balance)}
        </span>
      </div>

      <AdjustRow
        account={account}
        pregunta={`¿Cuánto tienes en ${account.name} ahora?`}
        onEdit={() => navigate(`/cuentas/${account.id}`)}
      />
    </div>
  )
}

/**
 * La tarjeta de crédito con su ciclo. El número protagonista es «por pagar»
 * —lo que el banco va a cobrar y cuándo—, no la deuda total: es lo único
 * accionable (ADR 0004, D4). La deuda entera y el consumo en curso quedan
 * abajo, en segundo plano.
 *
 * Sin ciclo cargado no hay «por pagar» que calcular y manda la deuda total,
 * que es lo único que se sabe.
 */
function CreditRow({ card }: { card: Card }) {
  const navigate = useNavigate()
  const account = getAccount(card.accountId)
  if (account === undefined) return null

  const debt = accountDebtCents(card.accountId)
  const libre = creditAvailableCents(card.accountId)
  const tag = cardTag(card)
  const status = account.balancePending ? null : creditCardStatus(card.accountId)
  const hoy = todayISO()

  const principal = status === null ? debt : status.billedCents
  const etiqueta = account.balancePending
    ? 'sin calibrar'
    : status === null
      ? 'debes'
      : status.confirmed
        ? 'por pagar'
        : '≈ por pagar'

  const vencido = status !== null && status.cycle.dueDate < hoy && status.billedCents > 0

  return (
    <div className="flex flex-col p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
          <CreditCard size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{card.name}</p>
          <span className="truncate text-xs text-muted-foreground">
            {['Crédito', tag].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-lg font-semibold tabular-nums text-rose-600">
            {account.balancePending ? '—' : formatMoney(principal)}
          </span>
          <span className="text-[10px] text-muted-foreground">{etiqueta}</span>
        </div>
      </div>

      {status !== null && status.billedCents > 0 && (
        <p
          className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${
            vencido ? 'text-rose-600' : 'text-muted-foreground'
          }`}
        >
          <CalendarClock size={14} />
          {dueLabel(status.cycle.dueDate, hoy)} · {formatDate(status.cycle.dueDate)}
        </p>
      )}

      {status !== null && !status.confirmed && (
        <ConfirmStatement account={account} status={status} />
      )}

      {/* Lo de abajo es contexto, no la decisión del día: va en un cuerpo más
          chico para que no compita con el «por pagar». */}
      <div className="mt-2 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
        {status !== null && status.runningCents > 0 && (
          <span>
            En curso {formatMoney(status.runningCents)} · se factura el{' '}
            {formatDate(status.cycle.openTo)}
          </span>
        )}
        {status !== null && !account.balancePending && <span>Deuda total {formatMoney(debt)}</span>}
        {account.creditLimitCents !== undefined && (
          <span>
            Línea {formatMoney(account.creditLimitCents)}
            {/* El "libre" es una resta contra la deuda: sin calibrar no existe.
                La línea sí — es un dato que el usuario cargó y no se esconde. */}
            {libre === null || account.balancePending ? null : (
              <>
                {' · libre '}
                {formatMoney(libre)}
                <span className="text-muted-foreground/70"> (del banco, no tuya)</span>
              </>
            )}
          </span>
        )}
        {status === null && (account.closingDay !== undefined || account.dueDay !== undefined) && (
          <span>
            {[
              account.closingDay === undefined ? undefined : `Cierra el ${account.closingDay}`,
              account.dueDay === undefined ? undefined : `vence el ${account.dueDay}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
      </div>

      {status !== null && status.billedCents > 0 && (
        <Button
          size="sm"
          onClick={() => navigate(`/registrar?pagar=${account.id}&monto=${status.billedCents}`)}
          className="mt-3 h-9 self-start"
        >
          Pagar {formatMoney(status.billedCents)}
        </Button>
      )}

      <AdjustRow
        account={account}
        pregunta={`¿Cuánto debes hoy en ${card.name}?`}
        deuda
        onEdit={() => navigate(`/tarjetas/${card.id}`)}
      />
    </div>
  )
}

/**
 * Kumi estima y el usuario confirma (ADR 0004, D5). Va como un enlace discreto
 * y no como un aviso permanente: el estado de cuenta tarda en llegar, y una
 * alerta que aparece sola cada mes y no se puede resolver todavía se vuelve
 * ruido que se aprende a ignorar.
 */
function ConfirmStatement({ account, status }: { account: Account; status: CardStatus }) {
  const [open, setOpen] = useState(false)
  const [monto, setMonto] = useState('')

  if (!open) {
    return (
      <button
        onClick={() => {
          setMonto(centsToInput(status.billedCents))
          setOpen(true)
        }}
        className="mt-1 self-start text-xs font-medium"
        style={{ color: LINK }}
      >
        Confirmar con tu estado de cuenta
      </button>
    )
  }

  function guardar() {
    const cents = parseAmountToCents(monto)
    if (cents === null || cents < 0) {
      toast.error('Ingresa el monto del estado de cuenta')
      return
    }
    const diferencia = cents - status.billedCents
    confirmStatement(account.id, cents)
    toast.success(
      diferencia === 0
        ? 'Estado de cuenta confirmado'
        : `Confirmado · ${formatMoney(Math.abs(diferencia))} de cargos del banco`,
    )
    setOpen(false)
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
      <label htmlFor={`estado-${account.id}`} className="text-xs text-muted-foreground">
        ¿Cuánto dice tu estado de cuenta del {formatDate(status.cycle.closedTo)}?
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">S/</span>
        <Input
          id={`estado-${account.id}`}
          inputMode="decimal"
          placeholder="0.00"
          value={monto}
          onChange={(e) => setMonto(sanitizeAmount(e.target.value))}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Manda el papel del banco. La diferencia con lo que calculó Kumi se anota como
        cargos suyos —membresía, ITF, desgravamen, intereses— fechados en el cierre.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={guardar} className="h-9 flex-1">
          Confirmar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-9">
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function DebitRow({ card }: { card: Card }) {
  const navigate = useNavigate()
  const cuenta = getAccount(card.accountId)
  const tag = cardTag(card)

  return (
    <div className="flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
        <CreditCard size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{card.name}</p>
        <span className="text-xs text-muted-foreground">
          {['Débito', tag, cuenta === undefined ? undefined : `saca de ${cuenta.name}`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <button
        onClick={() => navigate(`/tarjetas/${card.id}`)}
        aria-label={`Editar ${card.name}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <Pencil size={16} />
      </button>
    </div>
  )
}

/**
 * Calibrar contra la realidad, en cuentas y en tarjetas. El ajuste nunca es un
 * gasto ni un ingreso (ver CONTEXT.md): solo corrige el saldo, así que no toca
 * presupuesto ni análisis.
 *
 * En una tarjeta de crédito el usuario escribe lo que DEBE, en positivo, y acá
 * se le da vuelta el signo: su saldo es negativo por naturaleza, pero pedirle
 * «-1250» sería pedirle que piense como el modelo.
 */
function AdjustRow({
  account,
  pregunta,
  deuda = false,
  onEdit,
}: {
  account: Account
  pregunta: string
  deuda?: boolean
  onEdit: () => void
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')

  function start() {
    const actual = deuda ? accountDebtCents(account.id) : accountBalanceCents(account.id)
    setTarget(account.balancePending ? '' : centsToInput(actual))
    setOpen(true)
  }

  function confirm() {
    if (target.trim() === '') {
      toast.error(deuda ? 'Ingresa cuánto debes' : 'Ingresa el saldo real')
      return
    }
    const cents = parseAmountToCents(target)
    if (cents === null || cents < 0) {
      toast.error(deuda ? 'Ingresa una deuda válida' : 'Ingresa un saldo válido')
      return
    }
    const objetivo = deuda ? -cents : cents
    const delta = objetivo - accountBalanceCents(account.id)
    addAdjustment(account.id, objetivo)
    toast.success(
      delta === 0
        ? `${deuda ? 'Deuda' : 'Saldo'} confirmada en ${formatMoney(cents)}`.replace(
            'Saldo confirmada',
            'Saldo confirmado',
          )
        : `Ajuste registrado · ${delta > 0 ? '+' : ''}${formatMoney(delta)}`,
    )
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="mt-3 flex items-center gap-4">
        <button onClick={start} className="text-sm font-medium" style={{ color: LINK }}>
          {deuda ? 'Ajustar deuda' : 'Ajustar saldo'}
        </button>
        <button onClick={onEdit} className="text-sm font-medium text-muted-foreground">
          Editar
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl bg-muted/40 p-3">
      <label htmlFor={`target-${account.id}`} className="text-xs text-muted-foreground">
        {pregunta}
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">S/</span>
        <Input
          id={`target-${account.id}`}
          inputMode="decimal"
          placeholder="0.00"
          value={target}
          onChange={(e) => setTarget(sanitizeAmount(e.target.value))}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Esto crea un ajuste, no un gasto ni un ingreso: solo calibra
        {deuda ? ' la deuda' : ' el saldo'} con la realidad.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={confirm} className="h-9 flex-1">
          Guardar ajuste
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-9">
          Cancelar
        </Button>
      </div>
    </div>
  )
}

/* ---------- Yape y Plin ---------- */

const PROVIDERS: { id: WalletProvider; label: string }[] = [
  { id: 'yape', label: 'Yape' },
  { id: 'plin', label: 'Plin' },
]

/**
 * El origen se declara una vez y Registrar deja de adivinar: con dos bancos,
 * «pagué por Yape» no dice de cuál salió la plata (ADR 0004, D9).
 */
function WalletSection({
  wallets,
  accounts,
  cards,
}: {
  wallets: Billetera[]
  accounts: Account[]
  cards: Card[]
}) {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<WalletProvider>('yape')
  const [origen, setOrigen] = useState('')

  const bancos = accounts.filter((a) => a.kind === 'bank')
  // Se elige por tarjeta cuando la hay, porque es como el usuario lo piensa
  // ("mi Yape es de mi débito BCP"); la cuenta sale de la tarjeta.
  const opciones = [
    ...cards.map((c) => ({ id: `card:${c.id}`, label: c.name, hint: getAccount(c.accountId)?.name })),
    ...bancos.map((a) => ({ id: `account:${a.id}`, label: a.name, hint: undefined })),
  ]

  function guardar() {
    const [tipo, ref] = origen.split(':')
    if (!ref) {
      toast.error('Elige de dónde sale la plata')
      return
    }
    const label = PROVIDERS.find((p) => p.id === provider)!.label
    const creada =
      tipo === 'card'
        ? addWallet({ name: label, provider, accountId: '', cardId: ref })
        : addWallet({ name: label, provider, accountId: ref })
    if (creada === null) {
      toast.error('Ese origen no sirve', { description: 'Tiene que ser una cuenta de banco.' })
      return
    }
    toast.success(`${label} enlazado`)
    setOpen(false)
    setOrigen('')
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Yape y Plin
        </h2>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 text-sm font-medium"
            style={{ color: LINK }}
          >
            <Plus size={15} />
            Agregar
          </button>
        )}
      </div>

      <div className="surface flex flex-col divide-y divide-border p-1">
        {wallets.length === 0 && !open && (
          <Empty>
            Yape y Plin no son cuentas: son la forma de mover la plata de una. Di de cuál
            sale y Kumi la elige sola al registrar.
          </Empty>
        )}

        {wallets.map((w) => {
          const cuenta = getAccount(w.accountId)
          const tarjeta = cards.find((c) => c.id === w.cardId)
          return (
            <div key={w.id} className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
                <Smartphone size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{w.name}</p>
                <span className="text-xs text-muted-foreground">
                  sale de {cuenta?.name ?? '—'}
                  {tarjeta === undefined ? '' : ` (${tarjeta.name})`}
                </span>
              </div>
              <button
                onClick={() => {
                  deleteWallet(w.id)
                  toast.success(`${w.name} desenlazado`)
                }}
                aria-label={`Quitar ${w.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              >
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}

        {open && (
          <div className="flex flex-col gap-3 p-4">
            <div className="flex gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id)}
                  className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition ${
                    provider === p.id
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border text-muted-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <span className="text-xs text-muted-foreground">¿De dónde sale la plata?</span>
            {opciones.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Primero crea una cuenta de banco: Yape mueve la plata de una cuenta, no
                tiene saldo propio.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {opciones.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOrigen(o.id)}
                    className={`rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition ${
                      origen === o.id
                        ? 'border-accent bg-accent text-accent-foreground'
                        : 'border-border text-muted-foreground'
                    }`}
                  >
                    {o.label}
                    {o.hint === undefined ? '' : ` · ${o.hint}`}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={guardar} className="h-9 flex-1" disabled={opciones.length === 0}>
                Enlazar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="h-9">
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
