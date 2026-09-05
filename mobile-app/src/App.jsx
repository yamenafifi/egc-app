import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/context/AuthContext'
import { LangProvider } from '@/context/LangContext'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
import { LoadingBlock } from '@/components/Shared'

// Every page is loaded on demand rather than bundled into one ~1MB
// initial chunk - this app is used by field employees who may be on a
// weak site connection, so shipping every admin page (Users, Permission
// Templates, every desktop table variant, etc.) up front regardless of
// whether this session ever visits them was pure waste. Vite/Rollup
// splits each of these into its own chunk automatically; AppLayout
// itself stays a normal import so the persistent sidebar/nav frame
// doesn't unmount on every route change - see the Suspense boundaries
// around each layout's own <Outlet/> (AppLayout.jsx, desktop/Shell.jsx)
// for why the loading state shows there and not by replacing the whole
// shell.
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const ChangePasswordPage = lazy(() => import('@/pages/ChangePasswordPage'))
const InitialPasswordPage = lazy(() => import('@/pages/InitialPasswordPage'))
const HomePage = lazy(() => import('@/pages/HomePage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))
const PermissionTemplatesPage = lazy(() => import('@/pages/PermissionTemplatesPage'))
const SystemSettingsPage = lazy(() => import('@/pages/SystemSettingsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const EmployeeCardPage = lazy(() => import('@/pages/EmployeeCardPage'))
const LegalDocumentsPage = lazy(() => import('@/pages/LegalDocumentsPage'))
const LeaveRequestPage = lazy(() => import('@/pages/LeaveRequestPage'))
const AttendancePage = lazy(() => import('@/pages/AttendancePage'))
const LeavesPage = lazy(() => import('@/pages/LeavesPage'))
const FinalApprovalPage = lazy(() => import('@/pages/FinalApprovalPage'))
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'))
const ProjectSupervisorsPage = lazy(() => import('@/pages/ProjectSupervisorsPage'))
const DeductionRequestPage = lazy(() => import('@/pages/DeductionRequestPage'))
const DeductionsReviewPage = lazy(() => import('@/pages/DeductionsReviewPage'))
const MyDeductionsPage = lazy(() => import('@/pages/MyDeductionsPage'))
const ExpenseClaimRequestPage = lazy(() => import('@/pages/ExpenseClaimRequestPage'))
const MyExpenseClaimsPage = lazy(() => import('@/pages/MyExpenseClaimsPage'))
const ExpenseClaimDetailPage = lazy(() => import('@/pages/ExpenseClaimDetailPage'))
const ExpenseClaimsReviewPage = lazy(() => import('@/pages/ExpenseClaimsReviewPage'))
const ExpenseClaimFinalApprovalPage = lazy(() => import('@/pages/ExpenseClaimFinalApprovalPage'))
const ExpenseClaimReceiptsPage = lazy(() => import('@/pages/ExpenseClaimReceiptsPage'))

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Toaster position="top-center" toastOptions={{ duration: 3500, style: { fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13 } }} />
          <Suspense fallback={<LoadingBlock />}>
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
                <Route path="leave/new" element={<LeaveRequestPage />} />
                <Route path="attendance" element={<AttendancePage />} />
                <Route path="leaves" element={<LeavesPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="deductions/new" element={<DeductionRequestPage />} />
                <Route path="deductions/mine" element={<MyDeductionsPage />} />
                <Route path="expense-claims/new" element={<ExpenseClaimRequestPage />} />
                <Route path="expense-claims/mine" element={<MyExpenseClaimsPage />} />
                <Route path="expense-claims/:id" element={<ExpenseClaimDetailPage />} />
                {/* Admin routes */}
                <Route path="users" element={<ProtectedRoute permission="users.view_list"><UsersPage /></ProtectedRoute>} />
                <Route path="permission-templates" element={<ProtectedRoute permission="permission_templates.view"><PermissionTemplatesPage /></ProtectedRoute>} />
                <Route path="system-settings" element={<ProtectedRoute permission="system.manage_settings"><SystemSettingsPage /></ProtectedRoute>} />
                <Route path="project-supervisors" element={<ProtectedRoute permission="erp.manage_project_supervisors"><ProjectSupervisorsPage /></ProtectedRoute>} />
                <Route path="attendance/final-approval" element={<ProtectedRoute permission="attendance.final_approve"><FinalApprovalPage /></ProtectedRoute>} />
                <Route path="deductions/review" element={<ProtectedRoute permission="deductions.review"><DeductionsReviewPage /></ProtectedRoute>} />
                <Route path="expense-claims/review" element={<ProtectedRoute permission="expense_claims.review"><ExpenseClaimsReviewPage /></ProtectedRoute>} />
                <Route path="expense-claims/final-approval" element={<ProtectedRoute permission="expense_claims.final_approve"><ExpenseClaimFinalApprovalPage /></ProtectedRoute>} />
                <Route path="expense-claims/receipts" element={<ProtectedRoute permission="expense_claims.review"><ExpenseClaimReceiptsPage /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<Navigate to="/home" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  )
}
