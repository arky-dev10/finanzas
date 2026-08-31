import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { formatMoney, shortDate } from '@/lib/format'
import { deleteTransaction, getCategory, insertTransaction, signedCents } from '@/lib/store'
import type { Transaction } from '@/types'

export function TransactionItem({ tx }: { tx: Transaction }) {
  const navigate = useNavigate()
  // Los ajustes no tienen categoría.
  const cat = tx.categoryId ? getCategory(tx.categoryId) : undefined
  const signo = signedCents(tx)
  const entra = signo > 0

  function remove() {
    deleteTransaction(tx.id)
    toast('Movimiento eliminado', {
      action: { label: 'Deshacer', onClick: () => insertTransaction(tx) },
    })
  }

  return (
    <div className="flex items-center gap-3 pr-3">
      <button
        onClick={() => navigate(`/registrar/${tx.id}`)}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left active:bg-muted/50"
      >
        {cat && <CategoryIcon category={cat} size="sm" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {cat?.name ?? 'Sin categoría'}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {tx.note ? `${tx.note} · ` : ''}
            {shortDate(tx.date)}
          </span>
        </span>
        <span
          className={`text-sm font-semibold tabular-nums ${
            entra ? 'text-emerald-600' : 'text-foreground'
          }`}
        >
          {entra ? '+' : '-'}
          {formatMoney(Math.abs(signo))}
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
