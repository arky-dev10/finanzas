import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AppLayout } from '@/components/AppLayout'
import { PwaUpdater } from '@/components/PwaUpdater'
import { Toaster } from '@/components/ui/sonner'
import { Accounts } from '@/pages/Accounts'
import { AccountForm } from '@/pages/AccountForm'
import { CardForm } from '@/pages/CardForm'
import { Calendar } from '@/pages/Calendar'
import { ReminderForm } from '@/pages/ReminderForm'
import { Dashboard } from '@/pages/Dashboard'
import { AddTransaction } from '@/pages/AddTransaction'
import { Categories } from '@/pages/Categories'
import { History } from '@/pages/History'
import { Settings } from '@/pages/Settings'
import { Welcome } from '@/pages/Welcome'
import { CategoryDetail } from '@/pages/CategoryDetail'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Fuera del layout: pantalla completa, sin barra inferior. */}
        <Route path="/bienvenida" element={<Welcome />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/registrar" element={<AddTransaction />} />
          <Route path="/registrar/:id" element={<AddTransaction />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/categoria/:id" element={<CategoryDetail />} />
          <Route path="/cuentas" element={<Accounts />} />
          <Route path="/cuentas/nueva" element={<AccountForm />} />
          <Route path="/cuentas/:id" element={<AccountForm />} />
          <Route path="/tarjetas/nueva" element={<CardForm />} />
          <Route path="/tarjetas/:id" element={<CardForm />} />
          <Route path="/calendario" element={<Calendar />} />
          <Route path="/recordatorios/nuevo" element={<ReminderForm />} />
          <Route path="/recordatorios/:id" element={<ReminderForm />} />
          <Route path="/historial" element={<History />} />
          <Route path="/ajustes" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <PwaUpdater />
      <Toaster position="top-center" />
    </BrowserRouter>
  </StrictMode>,
)
