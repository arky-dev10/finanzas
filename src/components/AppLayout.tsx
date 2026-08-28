import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from '@/components/BottomNav'
import { hidesNav } from '@/lib/routes'

export function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-svh">
      <div className={hidesNav(pathname) ? undefined : 'pb-nav'}>
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}
