import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cycleSublabel, monthLabel, shiftMonth } from '@/lib/format'
import { currentMonthKey, useData } from '@/lib/store'

export function MonthNav({
  month,
  onChange,
}: {
  month: string
  onChange: (month: string) => void
}) {
  const { monthStartDay } = useData()
  const actual = currentMonthKey()
  const isCurrent = month === actual
  // Con el ciclo corrido, "Septiembre" solo escondería que incluye fines de
  // agosto: el rango abajo lo aclara. Con mes calendario no dice nada.
  const rango = cycleSublabel(month, monthStartDay)
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
        onClick={() => onChange(actual)}
        disabled={isCurrent}
        className="flex flex-col items-center disabled:cursor-default"
        title={isCurrent ? undefined : 'Volver al mes actual'}
      >
        <span className="text-base font-semibold capitalize">{monthLabel(month)}</span>
        {rango && <span className="text-xs text-muted-foreground">{rango}</span>}
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
