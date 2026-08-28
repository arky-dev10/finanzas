/** Rutas de formulario: ocupan toda la pantalla y esconden la barra inferior. */
export function hidesNav(pathname: string): boolean {
  return pathname.startsWith('/registrar')
}
