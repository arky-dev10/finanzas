import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, List, CalendarDays, Plus, Settings2 } from 'lucide-react'
import { hidesNav } from '@/lib/routes'

/*
 * La tríada temporal del ADR 0003: Historial es el pasado, Resumen el presente,
 * Calendario el futuro (y, desde su enmienda, también el rastro del pasado).
 *
 * Calendario toma el lugar de Categorías —elección explícita del usuario entre
 * tres propuestas—, que pasa a vivir en Ajustes y en las filas de cada
 * pantalla: su gestión queda a un tap del home por el hub del Resumen.
 */
const items = [
  { to: '/', label: 'Resumen', icon: LayoutGrid },
  { to: '/historial', label: 'Historial', icon: List },
  { to: '/calendario', label: 'Calendario', icon: CalendarDays },
  { to: '/ajustes', label: 'Ajustes', icon: Settings2 },
]

export function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (hidesNav(pathname)) return null

  return (
    <>
      {/* FAB flotante, anclado al borde derecho del marco de 480px */}
      <div
        className="pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-[480px] justify-end px-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}
      >
        <button
          onClick={() => navigate('/registrar')}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition active:scale-95"
          aria-label="Registrar movimiento"
        >
          <Plus size={26} />
        </button>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[480px] border-t border-border bg-background/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center px-2 py-2">
          {items.map((it) => (
            <NavItem key={it.to} {...it} />
          ))}
        </div>
      </nav>
    </>
  )
}

function NavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon: typeof LayoutGrid
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-1 py-1 text-[11px] transition ${
          isActive ? 'text-primary' : 'text-muted-foreground'
        }`
      }
    >
      <Icon size={20} />
      {label}
    </NavLink>
  )
}
