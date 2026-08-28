import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthKey, monthLabel, shiftMonth } from '@/lib/format'

export function MonthNav({
  month,
  onChange,
}: {
  month: string
  onChange: (month: string) => void
}) {
  const isCurrent = month === monthKey()
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Mes anterior"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        onClick={() => onChange(monthKey())}
        disabled={isCurrent}
        className="text-base font-semibold capitalize disabled:cursor-default"
        title={isCurrent ? undefined : 'Volver al mes actual'}
      >
        {monthLabel(month)}
      </button>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        aria-label="Mes siguiente"
        className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <ChevronRight size={22} />
      </button>
    </div>
  )
}
