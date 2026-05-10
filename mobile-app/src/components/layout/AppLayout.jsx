import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import toast from 'react-hot-toast'

const SIDEBAR_KEY = 'egc_sidebar_collapsed'

// ── Breadcrumb context ─────────────────────────────────────────────────────────
const BreadcrumbCtx = createContext({ extra: [], setExtra: () => {} })
export const useBreadcrumb = () => useContext(BreadcrumbCtx)

// Static route → label map (keys must match exactly)
const ROUTE_MAP = {
  '/dashboard':            'nav_home',
  '/timesheets':           'nav_timesheets',
  '/users':                'nav_users',
  '/permission-templates': 'nav_permissions',
  '/system-settings':      'nav_settings',
}

function Breadcrumbs({ extra }) {
  const location = useLocation()
  const { t, isRTL } = useLang()

  // Find current section label
  const routeKey = Object.keys(ROUTE_MAP).find(
    k => location.pathname === k || location.pathname.startsWith(k + '/')
  )
  const sectionLabel = routeKey ? t(ROUTE_MAP[routeKey]) : null

  const crumbs = [
    { label: t('appName'), to: '/dashboard', clickable: true },
    ...(sectionLabel ? [{ label: sectionLabel, to: routeKey, clickable: !!(extra && extra.length > 0) }] : []),
    ...(extra || []).map((e, i) => ({ label: e.label, to: e.to, clickable: i < (extra.length - 1) })),
  ]

  const Sep = () => (
    <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={11} color={c.textMuted} style={{ flexShrink: 0 }} />
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
      {crumbs.map((crumb, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          {i > 0 && <Sep />}
          {crumb.clickable && crumb.to ? (
            <Link to={crumb.to} style={{ fontSize: 12, color: c.textMuted, textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
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

// ── Profile popup ──────────────────────────────────────────────────────────────
function ProfileMenu({ initials, user, onLogout }) {
  const { lang, switchLang, languages, t, isRTL } = useLang()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: 34, height: 34, borderRadius: '50%',
        background: user?.erp_photo_url ? 'transparent' : c.primary,
        color: '#fff',
        border: `2px solid ${open ? c.primaryDark : 'transparent'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: c.font,
        overflow: 'hidden', padding: 0,
      }}>
        {user?.erp_photo_url
          ? <img src={user.erp_photo_url} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display='none'; e.target.parentNode.innerHTML = initials }} />
          : initials
        }
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', [isRTL ? 'left' : 'right']: 0,
          background: c.surface, border: `1px solid ${c.border}`,
          borderRadius: 12, boxShadow: c.lg, zIndex: 300, minWidth: 220, overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, background: c.bg }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{user?.display_name}</div>
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{user?.is_sysadmin ? 'System Administrator' : 'Employee'}</div>
          </div>
          <div style={{ padding: '8px 8px 4px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.7px', padding: '4px 8px 6px' }}>Language</div>
            {languages.map(l => (
              <button key={l.code} onClick={() => switchLang(l.code)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px',
                borderRadius: 7, background: lang === l.code ? c.primaryBg : 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: lang === l.code ? 700 : 500,
                color: lang === l.code ? c.primary : c.text, fontFamily: c.font,
              }}>
                <span style={{ fontSize: 16 }}>{l.flag}</span>
                <span style={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}>{l.nativeLabel}</span>
                {lang === l.code && <Icon name="check" size={12} color={c.primary} />}
              </button>
            ))}
          </div>
          <div style={{ padding: '4px 8px 8px', borderTop: `1px solid ${c.border}`, marginTop: 4 }}>
            <button onClick={() => { setOpen(false); onLogout() }} style={{
              display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '9px 10px',
              borderRadius: 7, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: c.red, fontFamily: c.font,
            }}>
              <Icon name="logout" size={15} color={c.red} />
              {t('nav_signout')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main layout ────────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { user, logout, hasPermission } = useAuth()
  const { t, isRTL } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const [extra, setExtra] = useState([])

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'true' } catch { return false }
  })
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Clear extra crumbs when route changes
  useEffect(() => { setExtra([]) }, [location.pathname])

  const toggleCollapse = () => setCollapsed(p => { const n = !p; localStorage.setItem(SIDEBAR_KEY, String(n)); return n })
  const handleLogout = async () => { await logout(); navigate('/login') }

  const NAV = [
    { to: '/dashboard',            label: t('nav_home'),        icon: 'home',     perm: null },
    { to: '/timesheets',           label: t('nav_timesheets'),  icon: 'clock',    perm: 'timesheet.view_own' },
    { to: '/employee-card',        label: 'Employee Card',      icon: 'idCard',   perm: null },
    { to: '/legal-documents',      label: 'Documents',          icon: 'passport', perm: null },
    { to: '/users',                label: t('nav_users'),       icon: 'users',    perm: 'users.view_list' },
    { to: '/permission-templates', label: t('nav_permissions'), icon: 'shield',   perm: 'permission_templates.view' },
    { to: '/system-settings',      label: t('nav_settings'),    icon: 'settings', perm: 'system.manage_settings' },
  ]
  const visible = NAV.filter(n => !n.perm || hasPermission(n.perm))
  const initials = user?.display_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  // ── Mobile ──────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <BreadcrumbCtx.Provider value={{ extra, setExtra }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: c.bg, direction: isRTL ? 'rtl' : 'ltr' }}>
          <div style={M.topbar}>
            <img src="/logo.png" alt="" style={M.logoImg} onError={e => e.target.style.display = 'none'} />
            <div style={{ flex: 1, minWidth: 0 }}><Breadcrumbs extra={extra} /></div>
            <ProfileMenu initials={initials} user={user} onLogout={handleLogout} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 72px' }}><Outlet /></div>
          <nav style={M.bottomNav}>
            {visible.slice(0, 5).map(item => {
              const active = location.pathname === item.to || location.pathname.startsWith(item.to + '/')
              return (
                <NavLink key={item.to} to={item.to} style={{ ...M.bottomNavItem, textDecoration: 'none' }}>
                  <Icon name={item.icon} size={20} color={active ? c.primary : '#6B7280'} />
                  <span style={{ fontSize: 9, color: active ? c.primary : '#6B7280', fontWeight: active ? 700 : 500, fontFamily: c.font, marginTop: 2 }}>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
        </div>
      </BreadcrumbCtx.Provider>
    )
  }

  // ── Desktop ──────────────────────────────────────────────────────────────────
  const sideW = collapsed ? 56 : 232

  return (
    <BreadcrumbCtx.Provider value={{ extra, setExtra }}>
      <div style={{ display: 'flex', minHeight: '100vh', background: c.bg, direction: isRTL ? 'rtl' : 'ltr' }}>

        {/* Sidebar */}
        <aside style={{ width: sideW, transition: 'width 0.22s ease', background: '#F7F8FA', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0, flexShrink: 0, borderRight: '1px solid #E2E8F0' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '16px 0' : '14px', borderBottom: '1px solid #E2E8F0', minHeight: 56, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <img src="/logo.png" alt="EGC" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: c.text, whiteSpace: 'nowrap' }}>{t('appName')}</div>
                <div style={{ fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.7px', marginTop: 1 }}>{t('appSub')}</div>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '8px', overflowY: 'auto' }}>
            {!collapsed && <div style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: '1px', padding: '6px 8px 4px', textTransform: 'uppercase' }}>MENU</div>}
            {visible.map(item => (
              <NavLink key={item.to} to={item.to} title={collapsed ? item.label : undefined} style={{ textDecoration: 'none', display: 'block' }}>
                {({ isActive }) => (
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    color: isActive ? c.primary : '#374151',
                    background: isActive ? c.primaryBg : 'transparent',
                    borderLeft: isActive ? `3px solid ${c.primary}` : '3px solid transparent',
                    borderRadius: isActive ? '0 8px 8px 0' : 8,
                    marginBottom: 2, padding: collapsed ? '10px 0' : '9px 10px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    fontWeight: isActive ? 700 : 400, transition: 'all 0.12s',
                  }}>
                    <Icon name={item.icon} size={17} color={isActive ? c.primary : '#374151'} />
                    {!collapsed && <span style={{ marginLeft: isRTL ? 0 : 9, marginRight: isRTL ? 9 : 0, fontSize: 13 }}>{item.label}</span>}
                  </div>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Collapse btn */}
          <div style={{ padding: collapsed ? '10px 0' : '10px 8px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
            <button onClick={toggleCollapse} style={{ width: 28, height: 28, borderRadius: 6, background: c.bg, border: `1px solid ${c.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={13} color="#374151" />
            </button>
          </div>
        </aside>

        {/* Main */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ height: 52, background: c.surface, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 10, boxShadow: c.sm }}>
            <Breadcrumbs extra={extra} />
            <ProfileMenu initials={initials} user={user} onLogout={handleLogout} />
          </div>
          <main style={{ flex: 1, overflowY: 'auto', padding: 28, minWidth: 0 }}><Outlet /></main>
        </div>
      </div>
    </BreadcrumbCtx.Provider>
  )
}

const M = {
  topbar: { height: 52, background: c.surface, borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, position: 'sticky', top: 0, zIndex: 50, boxShadow: c.sm },
  logoImg: { width: 26, height: 26, borderRadius: 6, objectFit: 'contain', flexShrink: 0 },
  bottomNav: { position: 'fixed', bottom: 0, left: 0, right: 0, height: 58, background: c.surface, borderTop: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', boxShadow: '0 -2px 12px rgba(0,0,0,0.06)', zIndex: 50, paddingBottom: 'env(safe-area-inset-bottom)' },
  bottomNavItem: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px' },
}
