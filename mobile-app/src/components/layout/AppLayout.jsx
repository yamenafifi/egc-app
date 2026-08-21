import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import toast from 'react-hot-toast'

const SIDEBAR_KEY = 'egc_sidebar_collapsed'

// ── Breadcrumb context ─────────────────────────────────────────────────────────
const BreadcrumbCtx = createContext({ extra: [], setExtra: () => {} })
export const useBreadcrumb = () => useContext(BreadcrumbCtx)

// ── Route label map ────────────────────────────────────────────────────────────
const ROUTE_MAP = {
  '/home': 'Home',
  '/profile': 'Profile',
  '/employee-card': 'Employee Card',
  '/legal-documents': 'Documents',
  '/users': 'Users',
  '/permission-templates': 'Permissions',
  '/system-settings': 'Settings',
  '/leave/new': 'Request Leave',
  '/attendance': 'Attendance',
  '/attendance/final-approval': 'Final Approval',
  '/leaves': 'Leaves',
  '/notifications': 'Notifications',
  '/project-supervisors': 'Project Supervisors',
  '/deductions/new': 'Flag a Deduction',
  '/deductions/mine': 'My Deductions',
  '/deductions/review': 'Deductions',
}

// ── Breadcrumbs (desktop only) ─────────────────────────────────────────────────
function Breadcrumbs({ extra }) {
  const location = useLocation()
  const routeKey = Object.keys(ROUTE_MAP).find(
    k => location.pathname === k || location.pathname.startsWith(k + '/')
  )
  const sectionLabel = routeKey ? ROUTE_MAP[routeKey] : null
  const crumbs = [
    { label: 'EGC App', to: '/home', clickable: true },
    ...(sectionLabel ? [{ label: sectionLabel, to: routeKey, clickable: !!(extra && extra.length > 0) }] : []),
    ...(extra || []).map((e, i) => ({ label: e.label, to: e.to, clickable: i < extra.length - 1 })),
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
      {crumbs.map((crumb, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          {i > 0 && <Icon name="chevronRight" size={11} color={c.textMuted} style={{ flexShrink: 0 }} />}
          {crumb.clickable && crumb.to ? (
            <Link to={crumb.to} style={{ fontSize: 12, color: c.textMuted, textDecoration: 'none', fontWeight: 500 }}>
              {crumb.label}
            </Link>
          ) : (
            <span style={{ fontSize: 12, fontWeight: i === crumbs.length - 1 ? 600 : 500, color: i === crumbs.length - 1 ? c.textSub : c.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

// ── Desktop profile dropdown ───────────────────────────────────────────────────
function ProfileMenu({ initials, user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: 34, height: 34, borderRadius: '50%',
        background: c.primaryBg, border: `2px solid ${c.primaryBorder}`,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: c.primary, overflow: 'hidden', padding: 0,
      }}>
        {user?.erp_photo_url
          ? <img src={user.erp_photo_url} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = initials }} />
          : initials
        }
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0, minWidth: 200,
          background: c.surface, borderRadius: 12, border: `1px solid ${c.border}`,
          boxShadow: c.lg, zIndex: 100, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{user?.display_name}</div>
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{user?.username}</div>
          </div>
          <button onClick={() => { setOpen(false); navigate('/profile') }} style={{
            width: '100%', padding: '11px 16px', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
            color: c.text, fontSize: 13, fontWeight: 600, fontFamily: c.font,
            borderBottom: `1px solid ${c.border}`,
          }}>
            <Icon name="user" size={14} color={c.textSub} />
            View Profile
          </button>
          <button onClick={onLogout} style={{
            width: '100%', padding: '11px 16px', background: 'none', border: 'none',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
            color: c.red, fontSize: 13, fontWeight: 600, fontFamily: c.font,
          }}>
            <Icon name="logout" size={14} color={c.red} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

// ── Desktop notification bell ─────────────────────────────────────────────────
function NotificationBell() {
  const navigate = useNavigate()
  const { count } = useUnreadCount()
  return (
    <button onClick={() => navigate('/notifications')} style={{
      position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
      padding: 6, display: 'flex', alignItems: 'center', borderRadius: 99, flexShrink: 0,
    }}>
      <Icon name="bell" size={18} color={c.textSub} />
      {count > 0 && (
        <span style={{
          position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, padding: '0 3px',
          background: c.red, color: '#fff', borderRadius: 99,
          fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #fff', lineHeight: 1,
        }}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}

// ── Mobile bottom tab bar ──────────────────────────────────────────────────────
function BottomNav({ tabs, hasAdmin, hasPermission }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [adminOpen, setAdminOpen] = useState(false)

  const ADMIN_ITEMS = [
    { to: '/users', label: 'Users', icon: 'users', perm: 'users.view_list' },
    { to: '/permission-templates', label: 'Permissions', icon: 'shield', perm: 'permission_templates.view' },
    { to: '/system-settings', label: 'Settings', icon: 'settings', perm: 'system.manage_settings' },
    { to: '/project-supervisors', label: 'Project Supervisors', icon: 'mapPin', perm: 'erp.manage_project_supervisors' },
    { to: '/attendance/final-approval', label: 'Final Approval', icon: 'checkCircle', perm: 'attendance.final_approve' },
    { to: '/deductions/review', label: 'Deductions', icon: 'alertCircle', perm: 'deductions.review' },
  ].filter(item => hasPermission(item.perm))

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
export default function AppLayout() {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [extra, setExtra] = useState([])
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed)
  }, [collapsed])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = user?.display_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  // ── Admin check
  const isAdmin = user?.is_sysadmin || hasPermission('users.view_list')
    || hasPermission('erp.manage_project_supervisors') || hasPermission('attendance.final_approve')

  // ── Desktop sidebar nav - Employee Card/Documents/Profile live as
  // quick links from Home / the avatar menu instead, not primary nav
  const DESKTOP_NAV = [
    { to: '/home', label: 'Home', icon: 'home', perm: null },
    { to: '/attendance', label: 'Attendance', icon: 'clock', perm: null },
    { to: '/leaves', label: 'Leaves', icon: 'calendar', perm: null },
    { to: '/users', label: 'Users', icon: 'users', perm: 'users.view_list' },
    { to: '/permission-templates', label: 'Permissions', icon: 'shield', perm: 'permission_templates.view' },
    { to: '/system-settings', label: 'Settings', icon: 'settings', perm: 'system.manage_settings' },
    { to: '/project-supervisors', label: 'Project Supervisors', icon: 'mapPin', perm: 'erp.manage_project_supervisors' },
    { to: '/attendance/final-approval', label: 'Final Approval', icon: 'checkCircle', perm: 'attendance.final_approve' },
    { to: '/deductions/review', label: 'Deductions', icon: 'alertCircle', perm: 'deductions.review' },
  ]
  const visibleDesktop = DESKTOP_NAV.filter(n => !n.perm || hasPermission(n.perm))

  // ── Mobile bottom tabs - Documents/Card reachable from Home's quick
  // links, Profile from the avatar; kept out of primary nav on purpose
  const MOBILE_TABS = [
    { to: '/home', label: 'Home', icon: 'home' },
    { to: '/attendance', label: 'Attendance', icon: 'clock' },
    { to: '/leaves', label: 'Leaves', icon: 'calendar' },
  ]

  // ── Mobile layout
  if (isMobile) {
    return (
      <BreadcrumbCtx.Provider value={{ extra, setExtra }}>
        <style>{`
          @keyframes mobilePageSlide {
            0% { transform: translateX(20px); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
          }
        `}</style>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: c.bg, fontFamily: c.font }}>
          {/* Content */}
          <div key={location.pathname} style={{ flex: 1, overflowY: 'auto', paddingBottom: 68, animation: 'mobilePageSlide 0.2s ease-out forwards' }}>
            <Outlet />
          </div>

          {/* Bottom nav */}
          <BottomNav tabs={MOBILE_TABS} hasAdmin={isAdmin} hasPermission={hasPermission} />
        </div>
      </BreadcrumbCtx.Provider>
    )
  }

  // ── Desktop layout (sidebar)
  const sw = collapsed ? 64 : 220

  return (
    <BreadcrumbCtx.Provider value={{ extra, setExtra }}>
      <div style={{ display: 'flex', height: '100dvh', fontFamily: c.font, background: c.bg }}>

        {/* Sidebar */}
        <aside style={{
          width: sw, flexShrink: 0, background: c.sidebar,
          borderRight: `1px solid ${c.sidebarBorder}`,
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s ease', overflow: 'hidden',
        }}>
          {/* Logo */}
          <div style={{
            height: 56, display: 'flex', alignItems: 'center',
            padding: collapsed ? '0 14px' : '0 16px',
            borderBottom: `1px solid ${c.sidebarBorder}`,
            gap: 12, flexShrink: 0,
          }}>
            <img src="/logo.png" alt="EGC" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'contain', flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
            {!collapsed && <span style={{ fontSize: 16, fontWeight: 800, color: c.text, whiteSpace: 'nowrap' }}>EGC App</span>}
          </div>

          {/* Nav items */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
            {visibleDesktop.map(item => (
              <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 12px' : '9px 12px',
                borderRadius: 9, marginBottom: 2,
                textDecoration: 'none', fontWeight: isActive ? 700 : 500,
                fontSize: 13, color: isActive ? c.sidebarActive : c.sidebarText,
                background: isActive ? c.sidebarActiveBg : 'transparent',
                transition: 'background 0.12s, color 0.12s',
                whiteSpace: 'nowrap', overflow: 'hidden',
                justifyContent: collapsed ? 'center' : 'flex-start',
              })}>
                <Icon name={item.icon} size={17} color="currentColor" style={{ flexShrink: 0 }} />
                {!collapsed && item.label}
              </NavLink>
            ))}
          </nav>

          {/* Collapse toggle */}
          <button onClick={() => setCollapsed(p => !p)} style={{
            margin: '8px', padding: '10px',
            background: 'none', border: `1px solid ${c.sidebarBorder}`,
            borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: c.sidebarMuted, flexShrink: 0,
          }}>
            <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14} color={c.sidebarMuted} />
          </button>
        </aside>

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Topbar */}
          <header style={{
            height: 56, background: c.surface,
            borderBottom: `1px solid ${c.border}`,
            display: 'flex', alignItems: 'center',
            padding: '0 24px', gap: 16, flexShrink: 0,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Breadcrumbs extra={extra} />
            </div>
            <NotificationBell />
            <ProfileMenu initials={initials} user={user} onLogout={handleLogout} />
          </header>

          {/* Page content */}
          <div style={{ flex: 1, overflowY: 'auto', background: c.bg }}>
            <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24, minHeight: '100%', boxSizing: 'border-box' }}>
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </BreadcrumbCtx.Provider>
  )
}
