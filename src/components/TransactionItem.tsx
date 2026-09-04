import { ArrowLeftRight, Scale, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { DEVOLUCION } from '@/components/colors'
import { formatMoney, shortDate } from '@/lib/format'
import {
  deleteTransaction,
  getAccount,
  getCategory,
  insertTransaction,
  signedCents,
} from '@/lib/store'
import type { Medium, Transaction } from '@/types'

const MEDIOS: Record<Medium, string> = {
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
}

/**
 * Una fila del historial. La naturaleza se lee de tres formas a la vez —signo,
 * color del monto y palabra en el detalle— para entenderla de un vistazo sin
 * agregarle adornos a la fila.
 */
/**
 * `installment` viene del ciclo que se está mirando, no del movimiento: la
 * misma compra en cuotas se ve como la compra entera en el mes en que se hizo
 * y como «cuota N de 12» en los siguientes (ADR 0004, D6).
 */
export function TransactionItem({
  tx,
  installment,
  installmentCount,
  centsInMonth,
}: {
  tx: Transaction
  installment?: number
  installmentCount?: number
  centsInMonth?: number
}) {
  const navigate = useNavigate()
  // La primera cuota se ve en el mes de la compra, así que ahí manda la compra
  // entera: es lo que pasó ese día, y es lo que hay que poder reconocer.
  const esEco = installment !== undefined && installment > 1
  const cat = tx.categoryId ? getCategory(tx.categoryId) : undefined
  const esAjuste = tx.nature === 'adjustment'
  const esDevolucion = tx.nature === 'refund'
  const esTransferencia = tx.nature === 'transfer'

  // Un ajuste no se edita como gasto: se corrige donde vive el saldo.
  const abrir = () => navigate(esAjuste ? '/cuentas' : `/registrar/${tx.id}`)

  function remove() {
    deleteTransaction(tx.id)
    toast('Movimiento eliminado', {
      action: { label: 'Deshacer', onClick: () => insertTransaction(tx) },
    })
  }

  // El signo de un movimiento tiene una sola definición, y vive en el store.
  const monto = esEco ? -(centsInMonth ?? tx.amountCents) : signedCents(tx)
  const tono =
    tx.nature === 'income'
      ? 'text-emerald-600'
      : esAjuste || esTransferencia
        ? 'text-muted-foreground'
        : 'text-foreground'

  /*
   * El medio es un detalle discreto: va al final, que es lo que se pierde por
   * truncado. La fecha no compite por ese ancho — vive en la columna derecha,
   * debajo del monto, donde siempre se lee entera.
   * En la cuenta Efectivo no hay medio que elegir: el efectivo ES la cuenta.
   */
  const cuenta = getAccount(tx.accountId)
  const medio = tx.medium ? MEDIOS[tx.medium] : cuenta?.kind === 'cash' ? 'Efectivo' : null
  const destino = tx.toAccountId ? getAccount(tx.toAccountId) : undefined
  // En una transferencia lo que importa es el recorrido, no el medio: de dónde
  // salió y a dónde entró es lo único que explica por qué se movieron dos saldos.
  /*
   * En una compra en cuotas el detalle explica de dónde sale el número: en el
   * mes de la compra, cuánto de esos S/ 1,200 pesa este mes; en los siguientes,
   * qué cuota es y de cuándo viene la compra. Sin esto el total del mes tendría
   * plata que no está en ninguna fila.
   */
  const cuotas =
    installmentCount === undefined
      ? null
      : esEco
        ? `cuota ${installment} de ${installmentCount} · compra del ${shortDate(tx.date)}`
        : `${installmentCount} cuotas · ${formatMoney(centsInMonth ?? 0)} este mes`

  const detalle = esAjuste
    ? [cuenta?.name, tx.note]
    : esTransferencia
      ? [`${cuenta?.name ?? '—'} → ${destino?.name ?? '—'}`, tx.note]
      : [cuotas, tx.note, medio]

  return (
    <div className="flex items-center gap-3 pr-3">
      <button
        onClick={abrir}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:bg-muted/50"
      >
        {esAjuste || esTransferencia ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {esAjuste ? <Scale size={16} /> : <ArrowLeftRight size={16} />}
          </span>
        ) : (
          cat && <CategoryIcon category={cat} size="sm" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {esAjuste
              ? 'Ajuste de saldo'
              : esTransferencia
                ? 'Transferencia'
                : (cat?.name ?? 'Sin categoría')}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {esDevolucion && (
              <span className="font-medium" style={{ color: DEVOLUCION }}>
                Devolución ·{' '}
              </span>
            )}
            {detalle.filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={`text-sm font-semibold tabular-nums ${tono}`}
            style={esDevolucion ? { color: DEVOLUCION } : undefined}
          >
            {esTransferencia ? '' : monto < 0 ? '−' : '+'}
            {formatMoney(Math.abs(monto))}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {shortDate(tx.date)}
          </span>
        </span>
      </button>
      {!esEco && (
        <button
          onClick={remove}
          className="text-muted-foreground/50 transition hover:text-destructive"
          aria-label="Eliminar movimiento"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  )
}
