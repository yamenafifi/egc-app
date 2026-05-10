import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import { LangProvider } from '@/context/LangContext'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'

import LoginPage from '@/pages/LoginPage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import UsersPage from '@/pages/UsersPage'
import TimesheetsPage from '@/pages/TimesheetsPage'
import PermissionTemplatesPage from '@/pages/PermissionTemplatesPage'
import SystemSettingsPage from '@/pages/SystemSettingsPage'
import EmployeeCardPage from '@/pages/EmployeeCardPage'
import LegalDocumentsPage from '@/pages/LegalDocumentsPage'

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="timesheets" element={<ProtectedRoute permission="timesheet.view_own"><TimesheetsPage /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute permission="users.view_list"><UsersPage /></ProtectedRoute>} />
              <Route path="permission-templates" element={<ProtectedRoute permission="permission_templates.view"><PermissionTemplatesPage /></ProtectedRoute>} />
              <Route path="system-settings" element={<ProtectedRoute permission="system.manage_settings"><SystemSettingsPage /></ProtectedRoute>} />
              <Route path="employee-card" element={<EmployeeCardPage />} />
              <Route path="legal-documents" element={<LegalDocumentsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  )
}
