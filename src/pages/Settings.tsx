import { useRef, useState, type ReactNode } from 'react'
import {
  Copy, Download, Link2, Link2Off, RefreshCw, RotateCcw, Share, Share2, Smartphone,
  TriangleAlert, Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { backupFilename, parseData, serialize } from '@/lib/backup'
import {
  centsToInput, cycleSublabel, formatMoney, monthKeyFor, monthLabelCap, parseAmountToCents,
  sanitizeAmount, todayISO,
} from '@/lib/format'
import { useInstall } from '@/lib/pwa'
import { replaceData, resetData, setMonthlyBudgetCents, setMonthStartDay, useData } from '@/lib/store'
import {
  getSyncState, link, resolveConflict, syncNow, unlink,
  type LinkMode, type SyncState,
} from '@/lib/sync'

/** En navegadores sin Web Share (escritorio) el respaldo baja como archivo. */
const PUEDE_COMPARTIR = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

export function Settings() {
  const data = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  const vinculado = getSyncState() !== null

  const meses = [...new Set(data.transactions.map((t) => t.date.slice(0, 7)))].sort()
  // Gasto neto acumulado: la devolución descuenta, el ajuste no cuenta.
  const total = data.transactions.reduce(
    (s, t) =>
      t.nature === 'expense' ? s + t.amountCents : t.nature === 'refund' ? s - t.amountCents : s,
    0,
  )

  async function exportar() {
    const json = serialize(data)
    const nombre = backupFilename()
    const file = new File([json], nombre, { type: 'application/json' })

    // En iOS instalado como PWA la descarga directa no funciona; compartir sí.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Respaldo Kumi' })
        return
      } catch {
        // el usuario canceló o no se pudo compartir: seguimos con la descarga
      }
    }

    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Respaldo generado · ${nombre}`)
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(serialize(data))
      toast.success('JSON copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar. Usa "Exportar archivo".')
    }
  }

  async function importar(file: File) {
    setOcupado(true)
    try {
      const texto = await file.text()
      const parsed = parseData(JSON.parse(texto))
      if (!parsed) {
        toast.error('El archivo no tiene el formato de un respaldo de Kumi')
        return
      }
      const previo = replaceData(parsed)
      toast.success(
        `Importados ${parsed.transactions.length} movimientos y ${parsed.categories.length} categorías`,
        { action: { label: 'Deshacer', onClick: () => replaceData(previo) }, duration: 8000 },
      )
    } catch {
      toast.error('No se pudo leer el archivo (¿es un JSON válido?)')
    } finally {
      setOcupado(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function empezarDeCero() {
    const previo = resetData()
    toast('Datos borrados · categorías por defecto restauradas', {
      action: { label: 'Deshacer', onClick: () => replaceData(previo) },
      duration: 10000,
    })
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-nav">
      <h1 className="px-1 text-lg font-semibold">Ajustes</h1>

      <InstalarApp />

      {/* `key` para que el input se re-sincronice tras importar o empezar de cero. */}
      <PresupuestoMensual key={data.monthlyBudgetCents} actual={data.monthlyBudgetCents} />

      <CicloMensual key={data.monthStartDay} actual={data.monthStartDay} />

      <section className="surface flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold">Tus datos</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Dato label="Movimientos" value={String(data.transactions.length)} />
          <Dato label="Categorías" value={String(data.categories.length)} />
          <Dato label="Gasto acumulado" value={formatMoney(total)} />
          <Dato
            label="Meses con datos"
            value={
              meses.length === 0
                ? '—'
                : meses.length === 1
                  ? monthLabelCap(meses[0])
                  : `${meses.length} · desde ${monthLabelCap(meses[0])}`
            }
          />
        </dl>
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          {vinculado
            ? 'Se guarda en este dispositivo y se sincroniza con tu cuenta. Aunque cambies de celular, tus movimientos vuelven al entrar.'
            : 'Todo se guarda solo en este dispositivo. Si limpias los datos del navegador o cambias de celular, se pierde. Exporta cada tanto, o vincula el dispositivo acá abajo.'}
        </p>
      </section>

      <VincularDispositivos />

      <section className="surface flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">Respaldo</h2>
        <Button onClick={exportar} className="h-11 justify-start gap-2">
          {PUEDE_COMPARTIR ? <Share2 size={17} /> : <Download size={17} />}
          Exportar a JSON
        </Button>
        <Button onClick={copiar} variant="secondary" className="h-11 justify-start gap-2">
          <Copy size={17} />
          Copiar JSON al portapapeles
        </Button>

        <div className="mt-2 border-t border-border pt-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importar(f)
            }}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            variant="outline"
            disabled={ocupado}
            className="h-11 w-full justify-start gap-2"
          >
            <Upload size={17} />
            {ocupado ? 'Importando…' : 'Importar desde JSON'}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Reemplaza todo lo que tienes ahora. Podrás deshacerlo desde el aviso que
            aparece después.
          </p>
        </div>
      </section>

      <section className="surface flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">Empezar de cero</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Borra todos los movimientos y vuelve a las categorías por defecto. Útil para
          limpiar datos de prueba. Exporta antes si quieres conservarlos.
        </p>
        <Button
          onClick={empezarDeCero}
          variant="outline"
          className="h-11 justify-start gap-2 text-destructive"
        >
          <RotateCcw size={17} />
          Borrar todo y empezar de cero
        </Button>
      </section>
    </div>
  )
}

/**
 * Se esconde sola una vez instalada. Chromium da un diálogo nativo; Safari en
 * iOS no tiene API para esto, así que ahí lo único posible son instrucciones.
 */
function InstalarApp() {
  const { canInstall, installed, install, isIOS } = useInstall()
  if (installed) return null

  async function instalar() {
    const acepto = await install()
    if (acepto) toast.success('Kumi quedó en tu pantalla de inicio')
  }

  return (
    <section className="surface flex flex-col gap-3 p-5">
      <h2 className="text-base font-semibold">Instalar la app</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Queda con su propio ícono en la pantalla de inicio, abre a pantalla completa
        (sin barra del navegador) y sigue funcionando sin internet.
      </p>

      {canInstall ? (
        <Button onClick={() => void instalar()} className="h-11 justify-start gap-2">
          <Smartphone size={17} />
          Instalar en este dispositivo
        </Button>
      ) : isIOS ? (
        <ol className="flex flex-col gap-2 text-xs leading-relaxed text-muted-foreground">
          <PasoInstalacion n={1}>
            Toca <Share size={13} className="inline align-[-2px]" />{' '}
            <b className="font-semibold text-foreground">Compartir</b>, abajo en Safari.
          </PasoInstalacion>
          <PasoInstalacion n={2}>
            Baja y elige{' '}
            <b className="font-semibold text-foreground">Añadir a pantalla de inicio</b>.
          </PasoInstalacion>
        </ol>
      ) : (
        <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
          Abre el menú de tu navegador y busca{' '}
          <b className="font-semibold text-foreground">Instalar Kumi</b>. Si no
          aparece, tu navegador no soporta instalar apps: probá con Chrome o Edge.
        </p>
      )}
    </section>
  )
}

function PasoInstalacion({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}

/** Tope de gasto de todo el mes: lo que el Resumen usa para el % del presupuesto. */
function PresupuestoMensual({ actual }: { actual: number }) {
  const [valor, setValor] = useState(actual > 0 ? centsToInput(actual) : '')

  function guardar() {
    const limpio = valor.trim()
    const monto = limpio === '' ? 0 : parseAmountToCents(limpio)
    if (monto === null) {
      toast.error('Escribe un monto válido')
      return
    }
    setMonthlyBudgetCents(monto)
    toast.success(
      monto > 0 ? `Presupuesto mensual: ${formatMoney(monto)}` : 'Presupuesto mensual desactivado',
    )
  }

  const sinCambios = (actual > 0 ? centsToInput(actual) : '') === valor.trim()

  return (
    <section className="surface flex flex-col gap-3 p-5">
      <h2 className="text-base font-semibold">Presupuesto mensual</h2>
      <div className="grid gap-2">
        <Label htmlFor="tope">Cuánto quieres gastar como máximo al mes</Label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">S/</span>
          <Input
            id="tope"
            inputMode="decimal"
            placeholder="0.00"
            value={valor}
            onChange={(e) => setValor(sanitizeAmount(e.target.value))}
          />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        El Resumen muestra qué porcentaje de este monto llevas gastado en el mes. Déjalo
        vacío para no llevar tope. Es aparte de los presupuestos por categoría.
      </p>
      <Button onClick={guardar} disabled={sinCambios} className="h-11">
        Guardar presupuesto
      </Button>
    </section>
  )
}

/**
 * Día en que empieza el mes del usuario. Quien cobra el 28 registra los gastos
 * del 28 al 31 "en septiembre": el ciclo se etiqueta por el mes en que termina,
 * que es el mes cuyo sueldo se está gastando. Con 1 (el default) todo sigue
 * siendo el mes calendario de siempre.
 */
function CicloMensual({ actual }: { actual: number }) {
  const [valor, setValor] = useState(String(actual))

  const dia = valor.trim() === '' ? null : Number(valor.trim())
  const valido = dia !== null && Number.isInteger(dia) && dia >= 1 && dia <= 28

  function guardar() {
    if (!valido) {
      toast.error('Elige un día entre 1 y 28')
      return
    }
    setMonthStartDay(dia)
    toast.success(
      dia === 1 ? 'Tu mes vuelve a ser el mes calendario' : `Tu mes empieza el día ${dia}`,
    )
  }

  const sinCambios = valor.trim() === String(actual)

  return (
    <section className="surface flex flex-col gap-3 p-5">
      <h2 className="text-base font-semibold">Ciclo mensual</h2>
      <div className="grid gap-2">
        <Label htmlFor="inicio-mes">Mi mes empieza el día</Label>
        <Input
          id="inicio-mes"
          inputMode="numeric"
          maxLength={2}
          placeholder="1"
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/\D/g, '').slice(0, 2))}
          className="w-24"
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Útil si cobras antes de fin de mes: tu mes va de tu día de cobro al día anterior
        del cobro siguiente. Con 1 es el mes calendario.
      </p>
      {valido && (
        <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          {previewCiclo(dia)}
        </p>
      )}
      <Button onClick={guardar} disabled={sinCambios || !valido} className="h-11">
        Guardar ciclo
      </Button>
    </section>
  )
}

/** El ciclo donde caería hoy con el día tipeado: "Septiembre = 28 ago – 27 sep". */
function previewCiclo(dia: number): string {
  const ciclo = monthKeyFor(todayISO(), dia)
  const rango = cycleSublabel(ciclo, dia)
  return rango ? `${monthLabelCap(ciclo)} = ${rango}` : `${monthLabelCap(ciclo)} = mes calendario`
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/* ---------- vincular dispositivos ---------- */

const PIN_LARGO = 6

/**
 * Vinculación con el servidor. Local-first: sin vincular la app anda igual, y
 * desvincular no borra nada. Lo único que se le pregunta al usuario es el
 * conflicto, porque es lo único que no se puede decidir por él.
 */
function VincularDispositivos() {
  const [estado, setEstado] = useState<SyncState | null>(() => getSyncState())
  const [conflicto, setConflicto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [servidor, setServidor] = useState('')
  const [usuario, setUsuario] = useState('')
  const [pin, setPin] = useState('')

  const puedeVincular =
    servidor.trim() !== '' && usuario.trim().length >= 3 && pin.length === PIN_LARGO

  async function vincular(mode: LinkMode) {
    setOcupado(true)
    const r = await link(servidor.trim(), usuario.trim(), pin, mode)
    // El PIN no se queda en memoria más de lo necesario.
    setPin('')
    setOcupado(false)

    if (r.status === 'ok') {
      setEstado(getSyncState())
      toast.success(`Vinculado como ${r.username}`)
      void sincronizar()
      return
    }
    const mensajes: Record<string, string> = {
      'bad-credentials': 'Usuario o PIN incorrectos',
      'username-taken': 'Ese usuario ya existe. Entrá con tu PIN.',
      offline: 'No se pudo conectar con el servidor',
    }
    if (r.status === 'locked') {
      const min = Math.ceil(r.retryAfterSeconds / 60)
      toast.error(`Demasiados intentos. Probá en ${min === 1 ? 'un minuto' : `${min} minutos`}.`)
      return
    }
    toast.error(mensajes[r.status] ?? (r.status === 'error' ? r.message : 'No se pudo vincular'))
  }

  async function sincronizar() {
    setOcupado(true)
    const r = await syncNow()
    setEstado(getSyncState())
    setOcupado(false)

    if (r.status === 'conflict') return setConflicto(true)
    if (r.status === 'ok') {
      toast.success(r.pushed ? 'Cambios subidos' : r.pulled ? 'Datos actualizados' : 'Todo al día')
      return
    }
    if (r.status === 'offline') return void toast.error('Sin conexión. Se sincroniza cuando vuelva.')
    if (r.status === 'auth-expired') return void toast.error('Se venció la sesión. Volvé a vincular.')
    if (r.status === 'error') toast.error(r.message)
  }

  async function resolver(quedarse: 'server' | 'local') {
    setOcupado(true)
    const r = await resolveConflict(quedarse)
    setEstado(getSyncState())
    setConflicto(false)
    setOcupado(false)
    if (r.status === 'ok') {
      toast.success(quedarse === 'server' ? 'Se trajeron los datos del servidor' : 'Se subieron los datos de este dispositivo')
    } else if (r.status === 'error') {
      toast.error(r.message)
    }
  }

  function desvincular() {
    unlink()
    setEstado(null)
    setConflicto(false)
    toast('Dispositivo desvinculado · tus datos siguen acá')
  }

  if (!estado) {
    return (
      <section className="surface flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">Vincular dispositivos</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Guardá una copia en tu cuenta para verla en otro celular. Kumi sigue
          funcionando sin conexión: la copia se actualiza sola cuando hay red.
        </p>

        <div className="grid gap-2">
          <Label htmlFor="srv">Servidor</Label>
          <Input
            id="srv"
            inputMode="url"
            autoCapitalize="none"
            placeholder="https://kumi.tuservidor.com"
            value={servidor}
            onChange={(e) => setServidor(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="usr">Usuario</Label>
          <Input
            id="usr"
            autoCapitalize="none"
            autoComplete="username"
            placeholder="tu-usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pin">PIN de 6 dígitos</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={PIN_LARGO}
            placeholder="••••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LARGO))}
          />
        </div>

        {/* Anchos completos como el resto de Ajustes: en dos columnas, el botón
            de la derecha queda debajo del botón flotante de registrar. */}
        <div className="mt-1 flex flex-col gap-2">
          <Button
            onClick={() => vincular('register')}
            disabled={!puedeVincular || ocupado}
            className="h-11 justify-start gap-2"
          >
            <Link2 size={17} />
            Crear cuenta
          </Button>
          <Button
            onClick={() => vincular('login')}
            disabled={!puedeVincular || ocupado}
            variant="secondary"
            className="h-11 justify-start gap-2"
          >
            <RefreshCw size={17} />
            Ya tengo cuenta en otro dispositivo
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Anotá tu PIN en algún lado: no hay forma de recuperarlo. Si lo perdés,
          los datos de este celular siguen intactos, pero la copia del servidor
          queda inaccesible.
        </p>
      </section>
    )
  }

  return (
    <section className="surface flex flex-col gap-3 p-5">
      <h2 className="text-base font-semibold">Vincular dispositivos</h2>

      <div className="flex items-center gap-2 text-sm">
        <Link2 size={17} className="shrink-0 text-emerald-600" />
        <span className="min-w-0 flex-1 truncate">
          Vinculado como <strong>{estado.username}</strong>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {estado.lastSyncAt
          ? `Última sincronización: ${new Date(estado.lastSyncAt).toLocaleString('es-PE')}`
          : 'Todavía no se sincronizó'}
        {estado.dirty && ' · hay cambios sin subir'}
      </p>

      {conflicto && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-900">
              Este dispositivo y el servidor cambiaron por separado. No se pisó
              nada todavía: elegí con cuál quedarte.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => resolver('local')} disabled={ocupado} className="h-10 text-xs">
              Lo de este celular
            </Button>
            <Button onClick={() => resolver('server')} disabled={ocupado} variant="secondary" className="h-10 text-xs">
              Lo del servidor
            </Button>
          </div>
        </div>
      )}

      <Button onClick={sincronizar} disabled={ocupado} className="h-11 justify-start gap-2">
        <RefreshCw size={17} />
        Sincronizar ahora
      </Button>
      <Button onClick={desvincular} variant="secondary" className="h-11 justify-start gap-2">
        <Link2Off size={17} />
        Desvincular este dispositivo
      </Button>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Desvincular no borra nada: tus movimientos siguen en este celular y la
        copia sigue en tu cuenta.
      </p>
    </section>
  )
}
