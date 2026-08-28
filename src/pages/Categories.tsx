import { useState } from 'react'
import { Plus, Trash2, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategoryIcon } from '@/components/CategoryIcon'
import { ICON_NAMES, getIcon } from '@/lib/icons'
import { formatMoney, sanitizeAmount } from '@/lib/format'
import { addCategory, deleteCategory, restoreCategory, updateCategory, useData } from '@/lib/store'
import type { Category, TxType } from '@/types'

/** Misma paleta validada que usan las categorías por defecto. */
const COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4',
  '#4a3aa7', '#e34948', '#008300', '#6b7280',
]

export function Categories() {
  const { categories } = useData()
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const expenses = categories.filter((c) => c.type === 'expense')
  const incomes = categories.filter((c) => c.type === 'income')

  function remove(id: string) {
    const { category, transactions } = deleteCategory(id)
    if (!category) return
    const n = transactions.length
    toast(
      n > 0
        ? `"${category.name}" eliminada · ${n} ${n === 1 ? 'movimiento' : 'movimientos'} también`
        : `"${category.name}" eliminada`,
      { action: { label: 'Deshacer', onClick: () => restoreCategory(category, transactions) } },
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4 pt-nav">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Categorías</h1>
        <Button
          size="sm"
          variant={creating ? 'secondary' : 'default'}
          onClick={() => {
            setCreating((o) => !o)
            setEditingId(null)
          }}
        >
          {creating ? <X size={16} /> : <Plus size={16} />}
          {creating ? 'Cancelar' : 'Nueva'}
        </Button>
      </header>

      {creating && <CreateForm onDone={() => setCreating(false)} />}

      <Section
        title="Gastos"
        items={expenses}
        editingId={editingId}
        onEdit={setEditingId}
        onDelete={remove}
      />
      <Section
        title="Ingresos"
        items={incomes}
        editingId={editingId}
        onEdit={setEditingId}
        onDelete={remove}
      />
    </div>
  )
}

function Section({
  title,
  items,
  editingId,
  onEdit,
  onDelete,
}: {
  title: string
  items: Category[]
  editingId: string | null
  onEdit: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border rounded-2xl border border-border">
        {items.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Sin categorías.</p>
        )}
        {items.map((c) => (
          <div key={c.id}>
            <div className="flex items-center gap-3 p-3">
              <CategoryIcon category={c} size="sm" />
              <button
                onClick={() => onEdit(editingId === c.id ? null : c.id)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">{c.name}</span>
                {c.type === 'expense' && (
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {c.budget
                      ? `Presupuesto ${formatMoney(c.budget)}`
                      : 'Sin presupuesto'}
                  </span>
                )}
              </button>
              <button
                onClick={() => onEdit(editingId === c.id ? null : c.id)}
                className="text-muted-foreground/60 transition hover:text-foreground"
                aria-label={`Editar ${c.name}`}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDelete(c.id)}
                className="text-muted-foreground/50 transition hover:text-destructive"
                aria-label={`Eliminar ${c.name}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
            {editingId === c.id && <EditForm category={c} onDone={() => onEdit(null)} />}
          </div>
        ))}
      </div>
    </section>
  )
}

function EditForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)
  const [icon, setIcon] = useState(category.icon)
  const [budget, setBudget] = useState(category.budget ? String(category.budget) : '')

  function save() {
    if (!name.trim()) {
      toast.error('Ponle un nombre')
      return
    }
    const value = Number(budget)
    updateCategory(category.id, {
      name: name.trim(),
      color,
      icon,
      budget: category.type === 'expense' && value > 0 ? value : undefined,
    })
    toast.success('Categoría actualizada')
    onDone()
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border bg-muted/30 p-4">
      <div className="grid gap-2">
        <Label htmlFor={`n-${category.id}`}>Nombre</Label>
        <Input id={`n-${category.id}`} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {category.type === 'expense' && (
        <div className="grid gap-2">
          <Label htmlFor={`b-${category.id}`}>Presupuesto mensual (opcional)</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">S/</span>
            <Input
              id={`b-${category.id}`}
              inputMode="decimal"
              placeholder="0.00"
              value={budget}
              onChange={(e) => setBudget(sanitizeAmount(e.target.value))}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Déjalo vacío para no llevar presupuesto en esta categoría.
          </p>
        </div>
      )}

      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} onChange={setIcon} />

      <div className="flex gap-2">
        <Button className="flex-1" onClick={save}>
          Guardar
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<TxType>('expense')
  const [color, setColor] = useState(COLORS[0])
  const [icon, setIcon] = useState(ICON_NAMES[0])
  const [budget, setBudget] = useState('')

  function save() {
    if (!name.trim()) {
      toast.error('Ponle un nombre')
      return
    }
    const value = Number(budget)
    addCategory({
      name: name.trim(),
      type,
      color,
      icon,
      budget: type === 'expense' && value > 0 ? value : undefined,
    })
    toast.success('Categoría creada')
    onDone()
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4">
      <Input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setType('expense')}
          className={`rounded-lg border-2 py-2 text-sm font-medium transition ${
            type === 'expense'
              ? 'border-rose-500 text-rose-600'
              : 'border-border text-muted-foreground'
          }`}
        >
          Gasto
        </button>
        <button
          onClick={() => setType('income')}
          className={`rounded-lg border-2 py-2 text-sm font-medium transition ${
            type === 'income'
              ? 'border-emerald-500 text-emerald-600'
              : 'border-border text-muted-foreground'
          }`}
        >
          Ingreso
        </button>
      </div>

      {type === 'expense' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">S/</span>
          <Input
            inputMode="decimal"
            placeholder="Presupuesto mensual (opcional)"
            value={budget}
            onChange={(e) => setBudget(sanitizeAmount(e.target.value))}
          />
        </div>
      )}

      <ColorPicker value={color} onChange={setColor} />
      <IconPicker value={icon} onChange={setIcon} />
      <Button onClick={save}>Crear categoría</Button>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full transition ${
            value === c ? 'ring-2 ring-foreground ring-offset-2' : ''
          }`}
          style={{ backgroundColor: c }}
          aria-label={`Color ${c}`}
          aria-pressed={value === c}
        />
      ))}
    </div>
  )
}

function IconPicker({ value, onChange }: { value: string; onChange: (i: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {ICON_NAMES.map((n) => {
        const Icon = getIcon(n)
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
              value === n ? 'border-primary bg-primary/10' : 'border-border'
            }`}
            aria-label={n}
            aria-pressed={value === n}
          >
            <Icon size={18} />
          </button>
        )
      })}
    </div>
  )
}
