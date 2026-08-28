import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AppLayout } from '@/components/AppLayout'
import { Toaster } from '@/components/ui/sonner'
import { Dashboard } from '@/pages/Dashboard'
import { AddTransaction } from '@/pages/AddTransaction'
import { Categories } from '@/pages/Categories'
import { History } from '@/pages/History'
import { Settings } from '@/pages/Settings'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/registrar" element={<AddTransaction />} />
          <Route path="/registrar/:id" element={<AddTransaction />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/historial" element={<History />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster position="top-center" />
    </BrowserRouter>
  </StrictMode>,
)
