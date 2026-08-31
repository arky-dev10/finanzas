import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { hidesNav } from '@/lib/routes'
import { useAutoSync } from '@/lib/useAutoSync'
import { useData } from '@/lib/store'

export function AppLayout() {
  const { pathname } = useLocation()
  const { onboarded } = useData()
  // Acá y no en cada pantalla: una sola suscripción para toda la app.
  useAutoSync()

  // Nadie entra a la app sin haber pasado por la bienvenida.
  if (!onboarded) return <Navigate to="/bienvenida" replace />

  return (
    <div className="min-h-svh">
      <div className={hidesNav(pathname) ? undefined : 'pb-nav'}>
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}
