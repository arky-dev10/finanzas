import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { subscribeToData } from '@/lib/store'
import { syncNow } from '@/lib/sync'

/** Un cambio no se sube al toque: se espera a que el usuario deje de tipear. */
const DEBOUNCE_MS = 3000

/**
 * Sincronización automática, montada una sola vez en el layout.
 *
 * Nada de esto es necesario para que la app ande: `syncNow()` sin vincular o sin
 * red devuelve enseguida y no toca los datos. Lo único que interrumpe al usuario
 * es el conflicto, porque es lo único que no se puede resolver sin él.
 */
export function useAutoSync() {
  const navigate = useNavigate()

  useEffect(() => {
    let pendiente: ReturnType<typeof setTimeout> | undefined
    let vivo = true

    async function correr() {
      const r = await syncNow()
      if (!vivo) return
      if (r.status === 'conflict') {
        toast.warning('Este dispositivo y el servidor cambiaron', {
          description: 'Elegí con cuál quedarte en Ajustes.',
          action: { label: 'Resolver', onClick: () => navigate('/ajustes') },
          duration: 10000,
        })
      } else if (r.status === 'auth-expired') {
        toast.error('Se venció la sesión del servidor', {
          description: 'Volvé a vincular el dispositivo en Ajustes.',
          action: { label: 'Ajustes', onClick: () => navigate('/ajustes') },
        })
      }
    }

    void correr()

    const dejarDeEscuchar = subscribeToData(() => {
      clearTimeout(pendiente)
      pendiente = setTimeout(() => void correr(), DEBOUNCE_MS)
    })

    // Al volver a la app o al recuperar la red: puede haber subido otro dispositivo.
    const alVolver = () => {
      if (document.visibilityState === 'visible') void correr()
    }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', alVolver)

    return () => {
      vivo = false
      clearTimeout(pendiente)
      dejarDeEscuchar()
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('online', alVolver)
    }
  }, [navigate])
}
