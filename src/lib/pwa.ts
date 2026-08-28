import { useSyncExternalStore } from 'react'

/**
 * Evento de Chromium que dispara el diálogo nativo de instalación.
 * No está en `lib.dom`, y solo se puede usar dentro del gesto del usuario que
 * lo desencadena, así que hay que guardarlo apenas llega.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Se captura a nivel de módulo, no dentro de un efecto: el navegador dispara
 * `beforeinstallprompt` apenas valida el manifest, normalmente antes de que
 * React monte nada. Si esperamos al efecto, el evento ya pasó y el botón
 * "Instalar" no aparece nunca.
 */
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // sin esto Chrome muestra su propia barra
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

const STANDALONE = '(display-mode: standalone), (display-mode: minimal-ui)'

/** ¿Se está corriendo instalada y no dentro del navegador? */
function isStandalone() {
  return (
    window.matchMedia(STANDALONE).matches ||
    // iOS no soporta display-mode y expone esto en su lugar.
    ('standalone' in navigator && navigator.standalone === true)
  )
}

function subscribeDisplayMode(cb: () => void) {
  const mq = window.matchMedia(STANDALONE)
  mq.addEventListener('change', cb)
  window.addEventListener('appinstalled', cb)
  return () => {
    mq.removeEventListener('change', cb)
    window.removeEventListener('appinstalled', cb)
  }
}

/**
 * Safari en iOS no implementa `beforeinstallprompt`: instalar es a mano desde
 * Compartir → Añadir a pantalla de inicio, así que ahí mostramos instrucciones.
 */
export const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS se hace pasar por macOS; el touch lo delata.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export function useInstall() {
  const canInstall = useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  )
  const installed = useSyncExternalStore(
    subscribeDisplayMode,
    isStandalone,
    () => false,
  )

  /** Abre el diálogo nativo. Devuelve si el usuario aceptó. */
  async function install() {
    if (!deferred) return false
    const evento = deferred
    await evento.prompt()
    const { outcome } = await evento.userChoice
    // El evento es de un solo uso: si lo rechazan, el navegador manda otro
    // más adelante por su cuenta.
    deferred = null
    emit()
    return outcome === 'accepted'
  }

  return { canInstall, installed, install, isIOS: IS_IOS }
}
