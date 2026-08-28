import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from 'sonner'

/** Cada hora: si dejas la app abierta días, igual se entera de una versión nueva. */
const INTERVALO_CHEQUEO = 60 * 60 * 1000

/**
 * Registra el service worker y avisa por toast, en vez de recargar sola.
 * Recargar en silencio a mitad de "Registrar movimiento" te borra lo escrito.
 *
 * No pinta nada: vive junto al <Toaster/>.
 */
export function PwaUpdater() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (!registro) return
      setInterval(() => {
        if (navigator.onLine) void registro.update()
      }, INTERVALO_CHEQUEO)
    },
  })

  useEffect(() => {
    if (!offlineReady) return
    // El `id` evita el toast duplicado por el doble render de StrictMode.
    toast.success('Listo para usar sin conexión', { id: 'pwa-offline' })
    setOfflineReady(false)
  }, [offlineReady, setOfflineReady])

  useEffect(() => {
    if (!needRefresh) return
    toast('Hay una versión nueva', {
      id: 'pwa-update',
      description: 'Se aplica al recargar. Tus datos no se tocan.',
      duration: Infinity,
      action: {
        label: 'Actualizar',
        onClick: () => void updateServiceWorker(true),
      },
      onDismiss: () => setNeedRefresh(false),
    })
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
