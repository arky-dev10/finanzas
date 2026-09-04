/**
 * Rutas de formulario: ocupan toda la pantalla y esconden la barra inferior.
 *
 * `/cuentas` es una lista y conserva la barra; `/cuentas/loquesea` es el
 * formulario de una cuenta y no.
 */
export function hidesNav(pathname: string): boolean {
  return (
    pathname.startsWith('/registrar') ||
    pathname.startsWith('/tarjetas') ||
    /^\/cuentas\/.+/.test(pathname)
  )
}
