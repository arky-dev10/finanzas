import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Landmark, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ISSUERS } from '@/lib/issuers'
import { addAccount, deleteAccount, getAccount, getData, replaceData, updateAccount } from '@/lib/store'

/** Solo estos dos se crean acá: la cuenta `credit` nace con su tarjeta. */
const KINDS: { id: 'bank' | 'cash'; label: string; hint: string; icon: typeof Landmark }[] = [
  { id: 'bank', label: 'Banco', hint: 'BCP, Interbank, una caja…', icon: Landmark },
  { id: 'cash', label: 'Efectivo', hint: 'La plata de tu bolsillo', icon: Wallet },
]

/**
 * Crear y editar una cuenta (`/cuentas/nueva`, `/cuentas/:id`). Las tarjetas de
 * crédito NO pasan por acá: su cuenta nace junto al plástico en el formulario
 * de tarjetas, que es lo que garantiza que no exista una línea suelta.
 */
export function AccountForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const existing = id ? getAccount(id) : undefined
  const isEdit = Boolean(id)

  const [name, setName] = useState(existing?.name ?? '')
  const [kind, setKind] = useState<'bank' | 'cash'>(
    existing?.kind === 'cash' ? 'cash' : 'bank',
  )
  const [issuer, setIssuer] = useState(existing?.issuer ?? '')

  if (isEdit && existing === undefined) {
    return <Missing onBack={() => navigate('/cuentas', { replace: true })} />
  }

  // La cuenta de una tarjeta de crédito se edita desde la tarjeta: ahí están
  // juntos su nombre, su línea y su ciclo, que es como el usuario la piensa.
  if (existing?.kind === 'credit') {
    return (
      <Missing
        texto="Esa es una tarjeta de crédito: se edita desde Tarjetas."
        onBack={() => navigate('/cuentas', { replace: true })}
      />
    )
  }

  function submit() {
    const limpio = name.trim()
    if (!limpio) {
      toast.error('Ponle un nombre a la cuenta')
      return
    }
    if (isEdit && id) {
      updateAccount(id, { name: limpio, issuer: issuer.trim() || undefined })
      toast.success('Cuenta actualizada')
    } else {
      addAccount({ name: limpio, kind, issuer: kind === 'bank' ? issuer.trim() : undefined })
      toast.success(`${limpio} creada · ajusta su saldo para incluirla en tu total`)
    }
    navigate('/cuentas')
  }

  function borrar() {
    if (!id) return
    const previo = getData()
    const result = deleteAccount(id)
    if (result === 'has-transactions') {
      toast.error('Tiene movimientos', {
        description: 'Borrarla movería un saldo tuyo. Quita primero sus movimientos.',
      })
      return
    }
    if (result === 'last-account') {
      toast.error('Es tu única cuenta', { description: 'Sin ninguna no habría dónde registrar.' })
      return
    }
    toast.success('Cuenta eliminada', {
      action: { label: 'Deshacer', onClick: () => replaceData(previo) },
    })
    navigate('/cuentas')
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
        <h1 className="text-lg font-semibold">{isEdit ? 'Editar cuenta' : 'Nueva cuenta'}</h1>
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
                  <k.icon size={18} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{k.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{k.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            autoFocus={!isEdit}
            placeholder={kind === 'cash' ? 'Ej. Efectivo' : 'Ej. BCP soles'}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {kind === 'bank' && (
          <div className="grid gap-2">
            <Label htmlFor="emisor">Banco (opcional)</Label>
            <Input
              id="emisor"
              placeholder="Ej. BCP"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {ISSUERS.slice(0, 6).map((b) => (
                <button
                  key={b}
                  onClick={() => setIssuer(b)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    issuer === b ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-muted-foreground'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isEdit && (
          <p className="rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
            La cuenta nace con el saldo pendiente de configurar: nadie contó todavía
            cuánto hay adentro, y poner cero sería afirmar algo que no sabemos. Ajusta
            su saldo desde Cuentas para que entre a tu total.
          </p>
        )}
      </div>

      <div
        className="mt-auto flex flex-col gap-2 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        <Button size="lg" className="h-12 text-base" onClick={submit}>
          {isEdit ? 'Guardar cambios' : 'Crear cuenta'}
        </Button>
        {isEdit ? (
          <Button variant="ghost" onClick={borrar} className="text-destructive">
            <Trash2 size={16} />
            Eliminar cuenta
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

function Missing({ texto = 'Esa cuenta ya no existe.', onBack }: { texto?: string; onBack: () => void }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-sm text-muted-foreground">{texto}</p>
      <Button onClick={onBack}>Ir a Cuentas</Button>
    </div>
  )
}
