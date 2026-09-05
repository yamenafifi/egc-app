import { useState, createContext, useContext, Suspense } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import { LoadingBlock } from '@/components/Shared'
import DesktopShell from '@/desktop/components/Shell'

// Kept for UsersPage.jsx, the one page that still pushes an extra
// breadcrumb segment - a no-op on desktop now (DesktopShell has its own,
// simpler breadcrumb with no "extra" concept), harmless on mobile since
// nothing reads it there either.
const BreadcrumbCtx = createContext({ extra: [], setExtra: () => {} })
export const useBreadcrumb = () => useContext(BreadcrumbCtx)

// ── Mobile bottom tab bar ──────────────────────────────────────────────────────
function BottomNav({ tabs, hasAdmin, hasPermission, isModuleEnabled }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [adminOpen, setAdminOpen] = useState(false)

  const ADMIN_ITEMS = [
    { to: '/users', label: 'Users', icon: 'users', perm: 'users.view_list' },
    { to: '/permission-templates', label: 'Permissions', icon: 'shield', perm: 'permission_templates.view' },
    { to: '/system-settings', label: 'Settings', icon: 'settings', perm: 'system.manage_settings' },
    { to: '/project-supervisors', label: 'Project Supervisors', icon: 'mapPin', perm: 'erp.manage_project_supervisors', module: 'timesheet' },
    { to: '/attendance/final-approval', label: 'Final Approval', icon: 'checkCircle', perm: 'attendance.final_approve', module: 'timesheet' },
    { to: '/deductions/review', label: 'Deductions', icon: 'alertCircle', perm: 'deductions.review', module: 'deductions' },
    { to: '/expense-claims/review', label: 'Expense Claims', icon: 'creditCard', perm: 'expense_claims.review', module: 'expense_claims' },
    { to: '/expense-claims/final-approval', label: 'Expense Claims Final Approval', icon: 'checkCircle', perm: 'expense_claims.final_approve', module: 'expense_claims' },
  ].filter(item => hasPermission(item.perm) && (!item.module || isModuleEnabled(item.module)))

  return (
    <>
      {/* Admin Sheet */}
      {adminOpen && (
        <div onClick={() => setAdminOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', background: c.surface,
            borderRadius: '18px 18px 0 0',
            padding: '12px 0 32px',
            animation: 'slideUp 0.22s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 99, background: c.border }} />
            </div>
            <div style={{ padding: '0 16px', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Admin</span>
            </div>
            {ADMIN_ITEMS.map(item => (
              <button key={item.to} onClick={() => { navigate(item.to); setAdminOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  padding: '14px 20px', background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: c.font, fontSize: 14, fontWeight: 500, color: c.text,
                }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={item.icon} size={17} color={c.textSub} />
                </div>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: c.surface,
        borderTop: `1px solid ${c.border}`,
        display: 'flex', alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -1px 0 rgba(0,0,0,0.06)',
      }}>
        {tabs.map(tab => {
          const active = location.pathname === tab.to
          return (
            <NavLink key={tab.to} to={tab.to} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: '9px 4px',
              textDecoration: 'none', color: active ? c.primary : c.textMuted,
              fontSize: 10, fontWeight: active ? 700 : 500,
              fontFamily: c.font, transition: 'color 0.15s',
              borderTop: active ? `2px solid ${c.primary}` : '2px solid transparent',
            }}>
              <Icon name={tab.icon} size={20} color={active ? c.primary : c.textMuted} />
              {tab.label}
            </NavLink>
          )
        })}
        {hasAdmin && (
          <button onClick={() => setAdminOpen(p => !p)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, padding: '9px 4px',
            background: 'none', border: 'none',
            color: c.textMuted, fontSize: 10, fontWeight: 500,
            fontFamily: c.font, cursor: 'pointer',
            borderTop: '2px solid transparent',
          }}>
            <Icon name="dashboard" size={20} color={c.textMuted} />
            Admin
          </button>
        )}
      </nav>
    </>
  )
}

// ── Main Layout ────────────────────────────────────────────────────────────────
// Picks between the mobile shell (below, unchanged card/sheet app) and the
// desktop shell (src/desktop/components/Shell.jsx - a real sidebar+topbar
// product layout, entirely separate code, entirely separate look). This
// split is deliberate: the two are different products sharing a data layer,
// not one layout stretched to fit both.
export default function AppLayout() {
  const location = useLocation()
  const { hasPermission, user, isModuleEnabled } = useAuth()
  const isMobile = useIsMobile()

  const isAdmin = user?.is_sysadmin || hasPermission('users.view_list')
    || hasPermission('erp.manage_project_supervisors') || hasPermission('attendance.final_approve')
    || hasPermission('expense_claims.review') || hasPermission('expense_claims.final_approve')

  const MOBILE_TABS = [
    { to: '/home', label: 'Home', icon: 'home' },
    { to: '/attendance', label: 'Attendance', icon: 'clock', module: 'timesheet' },
    { to: '/leaves', label: 'Leaves', icon: 'calendar', module: 'leaves' },
  ].filter(t => !t.module || isModuleEnabled(t.module))

  if (!isMobile) return <DesktopShell />

  return (
    <BreadcrumbCtx.Provider value={{ extra: [], setExtra: () => {} }}>
      <style>{`
        @keyframes mobilePageSlide {
          0% { transform: translateX(20px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: c.bg, fontFamily: c.font }}>
        <div key={location.pathname} style={{ flex: 1, overflowY: 'auto', paddingBottom: 68, animation: 'mobilePageSlide 0.2s ease-out forwards' }}>
          <Suspense fallback={<LoadingBlock />}>
            <Outlet />
          </Suspense>
        </div>
        <BottomNav tabs={MOBILE_TABS} hasAdmin={isAdmin} hasPermission={hasPermission} isModuleEnabled={isModuleEnabled} />
      </div>
    </BreadcrumbCtx.Provider>
  )
}
