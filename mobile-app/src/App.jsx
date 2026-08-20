import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import { LangProvider } from '@/context/LangContext'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'

import LoginPage from '@/pages/LoginPage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'
import InitialPasswordPage from '@/pages/InitialPasswordPage'
import HomePage from '@/pages/HomePage'
import ProfilePage from '@/pages/ProfilePage'
import UsersPage from '@/pages/UsersPage'
import PermissionTemplatesPage from '@/pages/PermissionTemplatesPage'
import SystemSettingsPage from '@/pages/SystemSettingsPage'
import SettingsPage from '@/pages/SettingsPage'
import EmployeeCardPage from '@/pages/EmployeeCardPage'
import LegalDocumentsPage from '@/pages/LegalDocumentsPage'

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Toaster position="top-center" toastOptions={{ duration: 3500, style: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13 } }} />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
            <Route path="/initial-password" element={<ProtectedRoute><InitialPasswordPage /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<HomePage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="employee-card" element={<EmployeeCardPage />} />
              <Route path="legal-documents" element={<LegalDocumentsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              {/* Admin routes */}
              <Route path="users" element={<ProtectedRoute permission="users.view_list"><UsersPage /></ProtectedRoute>} />
              <Route path="permission-templates" element={<ProtectedRoute permission="permission_templates.view"><PermissionTemplatesPage /></ProtectedRoute>} />
              <Route path="system-settings" element={<ProtectedRoute permission="system.manage_settings"><SystemSettingsPage /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  )
}
