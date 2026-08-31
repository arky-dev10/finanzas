import { Scale, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { shortDate } from '@/lib/format'
// FASE A: andamio con el contrato del modelo nuevo.
// FASE B: formatMoney → '@/lib/format'; el resto → '@/lib/store' y '@/types'.
import {
  deleteTransaction,
  formatMoney,
  getAccount,
  getCategory,
  insertTransaction,
  type Medium,
  type Transaction,
} from '@/preview-fase-a'

const MEDIOS: Record<Medium, string> = {
  yape: 'Yape',
  plin: 'Plin',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  other: 'Otro',
}

/**
 * Azul de devolución: ni el verde de ingreso (no es plata nueva) ni el tono de
 * gasto (no salió plata). Va siempre con la palabra «Devolución» en la línea de
 * detalle: el color nunca es lo único que lo dice.
 */
const DEVOLUCION = '#1f6c9f'

/**
 * Una fila del historial. La naturaleza se lee de tres formas a la vez —signo,
 * color del monto y palabra en el detalle— para entenderla de un vistazo sin
 * agregarle adornos a la fila.
 */
export function TransactionItem({ tx }: { tx: Transaction }) {
  const navigate = useNavigate()
  const cat = tx.categoryId ? getCategory(tx.categoryId) : undefined
  const esAjuste = tx.nature === 'adjustment'
  const esDevolucion = tx.nature === 'refund'

  // Un ajuste no se edita como gasto: se corrige donde vive el saldo.
  const abrir = () => navigate(esAjuste ? '/cuentas' : `/registrar/${tx.id}`)

  function remove() {
    deleteTransaction(tx.id)
    toast('Movimiento eliminado', {
      action: { label: 'Deshacer', onClick: () => insertTransaction(tx) },
    })
  }

  // El ajuste ya trae su signo en el monto; el resto lo toma de la naturaleza.
  const monto = tx.nature === 'expense' ? -tx.amountCents : tx.amountCents
  const tono =
    tx.nature === 'income'
      ? 'text-emerald-600'
      : esAjuste
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
  const detalle = esAjuste ? [cuenta?.name, tx.note] : [tx.note, medio]

  return (
    <div className="flex items-center gap-3 pr-3">
      <button
        onClick={abrir}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:bg-muted/50"
      >
        {esAjuste ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Scale size={16} />
          </span>
        ) : (
          cat && <CategoryIcon category={cat} size="sm" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {esAjuste ? 'Ajuste de saldo' : (cat?.name ?? 'Sin categoría')}
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
            {monto < 0 ? '−' : '+'}
            {formatMoney(Math.abs(monto))}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {shortDate(tx.date)}
          </span>
        </span>
      </button>
      <button
        onClick={remove}
        className="text-muted-foreground/50 transition hover:text-destructive"
        aria-label="Eliminar movimiento"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
