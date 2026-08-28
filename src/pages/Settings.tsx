import { useRef, useState } from 'react'
import { Copy, Download, RotateCcw, Share2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { backupFilename, parseData, serialize } from '@/lib/backup'
import { formatMoney, monthLabelCap } from '@/lib/format'
import { replaceData, resetData, useData } from '@/lib/store'

/** En navegadores sin Web Share (escritorio) el respaldo baja como archivo. */
const PUEDE_COMPARTIR = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'

export function Settings() {
  const data = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)

  const meses = [...new Set(data.transactions.map((t) => t.date.slice(0, 7)))].sort()
  const total = data.transactions.reduce(
    (s, t) => (t.type === 'expense' ? s + t.amount : s),
    0,
  )

  async function exportar() {
    const json = serialize(data)
    const nombre = backupFilename()
    const file = new File([json], nombre, { type: 'application/json' })

    // En iOS instalado como PWA la descarga directa no funciona; compartir sí.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Respaldo Finanzas' })
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
        toast.error('El archivo no tiene el formato de un respaldo de Finanzas')
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
          Todo se guarda solo en este dispositivo. Si limpias los datos del navegador o
          cambias de celular, se pierde. Exporta cada tanto.
        </p>
      </section>

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

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
