import { useState, useEffect, useRef, Suspense } from 'react'
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { Icon } from '@/components/Icons'
import { LoadingBlock } from '@/components/Shared'

const SIDEBAR_KEY = 'egc_desktop_sidebar_collapsed'

const ROUTE_LABELS = {
  '/home': 'Dashboard',
  '/attendance': 'Timesheets',
  '/leaves': 'Leaves',
  '/deductions/review': 'Deductions',
  '/expense-claims/review': 'Expense Claims',
  '/expense-claims/final-approval': 'Expense Claims · Final Approval',
  '/expense-claims/receipts': 'Receipts',
  '/users': 'Users',
  '/permission-templates': 'Permissions',
  '/system-settings': 'Settings',
  '/project-supervisors': 'Project Supervisors',
  '/expense-claims': 'Expense Claims',
}

// Grouped nav, not a flat list - this is the difference between "a sidebar"
// and "an admin product's navigation": sections group related work the way
// an operator actually thinks about it (their own work vs. things they
// review vs. system administration), and each item's badge count comes
// from the same permission-gated queue endpoints the pages themselves use.
function buildNavSections(hasPermission, isModuleEnabled) {
  const sections = [
    {
      label: null,
      items: [
        { to: '/home', label: 'Dashboard', icon: 'dashboard' },
      ],
    },
    {
      label: 'Workforce',
      items: [
        { to: '/attendance', label: 'Timesheets', icon: 'clock', module: 'timesheet' },
        { to: '/leaves', label: 'Leaves', icon: 'calendar', module: 'leaves' },
      ],
    },
    {
      label: 'Approvals',
      items: [
        { to: '/attendance?tab=final', label: 'Timesheet Final Approval', icon: 'checkCircle', perm: 'attendance.final_approve', matchQuery: 'tab=final', module: 'timesheet' },
        { to: '/deductions/review', label: 'Deductions', icon: 'alertCircle', perm: 'deductions.review', module: 'deductions' },
        { to: '/expense-claims/review', label: 'Expense Claims', icon: 'creditCard', perm: 'expense_claims.review', module: 'expense_claims' },
        { to: '/expense-claims/final-approval', label: 'Expense Claims Final Approval', icon: 'checkCircle', perm: 'expense_claims.final_approve', module: 'expense_claims' },
        { to: '/expense-claims/receipts', label: 'Receipts', icon: 'search', perm: 'expense_claims.review', module: 'expense_claims' },
      ],
    },
    {
      label: 'Administration',
      items: [
        { to: '/users', label: 'Users', icon: 'users', perm: 'users.view_list' },
        { to: '/permission-templates', label: 'Permissions', icon: 'shield', perm: 'permission_templates.view' },
        { to: '/project-supervisors', label: 'Project Supervisors', icon: 'mapPin', perm: 'erp.manage_project_supervisors', module: 'timesheet' },
        { to: '/system-settings', label: 'Settings', icon: 'settings', perm: 'system.manage_settings' },
      ],
    },
  ]
  return sections
    .map(s => ({
      ...s,
      items: s.items.filter(i => (!i.perm || hasPermission(i.perm)) && (!i.module || isModuleEnabled(i.module))),
    }))
    .filter(s => s.items.length > 0)
}

function Breadcrumb() {
  const location = useLocation()
  const key = Object.keys(ROUTE_LABELS)
    .sort((a, b) => b.length - a.length)
    .find(k => location.pathname === k || location.pathname.startsWith(k + '/'))
  let label = key ? ROUTE_LABELS[key] : null
  if (location.pathname === '/attendance' && location.search.includes('tab=final')) label = 'Timesheets · Final Approval'
  return (
    <div className="flex items-center gap-1.5 text-sm min-w-0">
      <Link to="/home" className="text-slate-400 hover:text-slate-600 font-medium">EGC App</Link>
      {label && (
        <>
          <Icon name="chevronRight" size={13} className="text-slate-300 shrink-0" />
          <span className="text-slate-800 font-semibold truncate">{label}</span>
        </>
      )}
    </div>
  )
}

function NotificationBell() {
  const navigate = useNavigate()
  const { count } = useUnreadCount()
  return (
    <button
      onClick={() => navigate('/notifications')}
      className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
    >
      <Icon name="bell" size={17} className="text-slate-500" />
      {count > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px]
                          font-bold flex items-center justify-center border-2 border-white leading-none">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}

function ProfileMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const initials = user?.display_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center
                   text-xs font-bold text-slate-600 overflow-hidden hover:border-slate-300 transition-colors"
      >
        {user?.erp_photo_url
          ? <img src={user.erp_photo_url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none' }} />
          : initials}
      </button>
      {open && (
        <div className="absolute top-11 right-0 min-w-[200px] bg-white rounded-lg border border-slate-200 shadow-popover overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-800">{user?.display_name}</div>
            <div className="text-xs text-slate-400 mt-0.5">{user?.username}</div>
          </div>
          <button
            onClick={() => { setOpen(false); navigate('/profile') }}
            className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
          >
            <Icon name="user" size={14} className="text-slate-400" /> View Profile
          </button>
          <button
            onClick={onLogout}
            className="w-full px-4 py-2.5 flex items-center gap-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <Icon name="logout" size={14} /> Sign Out
          </button>
        </div>
      )}
    </div>
  )
}

export default function DesktopShell() {
  const { user, logout, hasPermission, isModuleEnabled } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true')

  useEffect(() => { localStorage.setItem(SIDEBAR_KEY, collapsed) }, [collapsed])

  const handleLogout = async () => { await logout(); navigate('/login') }
  const sections = buildNavSections(hasPermission, isModuleEnabled)
  const allItems = sections.flatMap(s => s.items)
  const sw = collapsed ? 64 : 232

  return (
    <div className="desktop-root flex h-dvh bg-slate-50 font-sans text-slate-900" style={{ fontFamily: "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif" }}>
      <aside
        style={{ width: sw }}
        className="shrink-0 bg-white border-r border-slate-200 flex flex-col transition-[width] duration-200 overflow-hidden"
      >
        <div className={`h-14 flex items-center border-b border-slate-200 gap-2.5 shrink-0 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
          <img src="/logo.png" alt="EGC" className="w-6 h-6 rounded object-contain shrink-0" onError={e => { e.target.style.display = 'none' }} />
          {!collapsed && <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">EGC App</span>}
        </div>

        <nav className="flex-1 overflow-y-auto desktop-scrollbar py-3 px-2">
          {sections.map((section, i) => (
            <div key={i} className={i > 0 ? 'mt-4' : ''}>
              {section.label && !collapsed && (
                <div className="px-2 mb-1 text-[11px] font-medium text-slate-400">{section.label}</div>
              )}
              {section.items.map(item => {
                const [itemPath] = item.to.split('?')
                const pathMatches = location.pathname === itemPath || location.pathname.startsWith(itemPath + '/')
                // matchQuery distinguishes nav entries that share a pathname
                // (Timesheets vs. its Final Approval tab both live at
                // /attendance) - an item with matchQuery is only active when
                // that query is present; a plain item (no matchQuery) is only
                // active when NONE of its section siblings' matchQuery is.
                const active = item.matchQuery
                  ? pathMatches && location.search.includes(item.matchQuery)
                  : pathMatches && !allItems.some(sib => sib.matchQuery && sib.to.split('?')[0] === itemPath && location.search.includes(sib.matchQuery))
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2.5 rounded-md text-[13px] mb-0.5 transition-colors min-w-0
                      ${collapsed ? 'justify-center px-2 py-2' : 'px-2.5 py-[7px]'}
                      ${active ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 font-normal hover:bg-slate-50'}`}
                  >
                    <Icon name={item.icon} size={15} className="shrink-0" />
                    {!collapsed && <span className="truncate min-w-0">{item.label}</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed(p => !p)}
          className="m-2 p-2 rounded-md border border-slate-200 text-slate-400 bg-white hover:bg-slate-100 flex items-center justify-center shrink-0"
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={14} />
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0">
          <div className="flex-1 min-w-0"><Breadcrumb /></div>
          <NotificationBell />
          <ProfileMenu user={user} onLogout={handleLogout} />
        </header>

        <main className="flex-1 overflow-y-auto desktop-scrollbar">
          <div className="max-w-[1400px] mx-auto p-6 h-full">
            <Suspense fallback={<LoadingBlock />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
