import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'

// Service categories — Absher-style tile grid
const SERVICES = [
  {
    id: 'timesheet-log',
    label: 'Log Attendance',
    desc: 'Clock in / out with QR',
    icon: 'qr',
    color: c.primary,
    colorBg: c.primaryBg,
    to: '/timesheets',
    tab: 'scan',
    perm: 'timesheet.add_record',
  },
  {
    id: 'timesheet-view',
    label: 'My Timesheets',
    desc: 'View and submit hours',
    icon: 'clock',
    color: '#2563EB',
    colorBg: '#DBEAFE',
    to: '/timesheets',
    tab: 'entries',
    perm: 'timesheet.view_own',
  },
  {
    id: 'timesheet-submit',
    label: 'Submit for Approval',
    desc: 'Bundle & send for review',
    icon: 'upload',
    color: '#059669',
    colorBg: '#D1FAE5',
    to: '/timesheets',
    tab: 'entries',
    perm: 'timesheet.add_record',
  },
  {
    id: 'timesheet-approve',
    label: 'Approve Timesheets',
    desc: 'Review pending submissions',
    icon: 'checkCircle',
    color: '#D97706',
    colorBg: '#FEF3C7',
    to: '/timesheets',
    tab: 'submissions',
    perm: 'timesheet.approve',
  },
  {
    id: 'my-qr',
    label: 'My QR Code',
    desc: 'Show for attendance scan',
    icon: 'qr',
    color: '#7C3AED',
    colorBg: '#EDE9FE',
    to: '/timesheets',
    tab: 'qr',
    perm: null,
  },
  {
    id: 'expense',
    label: 'Expense Claims',
    desc: 'Submit employee expenses',
    icon: 'creditCard',
    color: '#DC2626',
    colorBg: '#FEE2E2',
    to: null, // future
    perm: null,
    soon: true,
  },
  {
    id: 'documents',
    label: 'Legal Documents',
    desc: 'Passport & ID documents',
    icon: 'passport',
    color: '#0891B2',
    colorBg: '#CFFAFE',
    to: '/legal-documents',
    perm: null,
  },
  {
    id: 'emp-card',
    label: 'Employee Card',
    desc: 'Digital employee profile',
    icon: 'idCard',
    color: '#65A30D',
    colorBg: '#ECFCCB',
    to: '/employee-card',
    perm: null,
  },
  {
    id: 'users-admin',
    label: 'Manage Users',
    desc: 'Create & manage accounts',
    icon: 'users',
    color: c.primary,
    colorBg: c.primaryBg,
    to: '/users',
    perm: 'users.view_list',
  },
  {
    id: 'perms-admin',
    label: 'Permission Templates',
    desc: 'Role & access management',
    icon: 'shield',
    color: '#7C3AED',
    colorBg: '#EDE9FE',
    to: '/permission-templates',
    perm: 'permission_templates.view',
  },
  {
    id: 'system-settings',
    label: 'System Settings',
    desc: 'QR vs manual timesheet, system config',
    icon: 'settings',
    color: '#0891B2',
    colorBg: '#CFFAFE',
    to: '/system-settings',
    perm: 'system.manage_settings',
    admin: true,
  },
]

export default function DashboardPage() {
  const { user, hasPermission } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('good_morning') : hour < 17 ? t('good_afternoon') : t('good_evening')
  const firstName = user?.display_name?.split(' ')[0] || 'User'

  const visible = SERVICES.filter(s => !s.perm || hasPermission(s.perm))

  const handleTile = (svc) => {
    if (svc.soon) return
    if (svc.to) navigate(svc.to, svc.tab ? { state: { tab: svc.tab } } : undefined)
  }

  // Group into categories
  const mainServices = visible.filter(s => !s.perm?.startsWith('users') && !s.perm?.startsWith('permission') && !s.admin)
  const adminServices = visible.filter(s => s.perm?.startsWith('users') || s.perm?.startsWith('permission') || s.admin)

  return (
    <div style={S.page}>
      {/* Welcome banner */}
      <div style={S.banner}>
        <div style={S.bannerLeft}>
          <div style={S.bannerGreeting}>{greeting}, {firstName}</div>
          <div style={S.bannerSub}>
            {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </div>
        </div>
        <div style={S.bannerRight}>
          <div style={S.empCard}>
            {user?.erp_photo_url
              ? <img src={user.erp_photo_url} alt={user?.display_name} style={{ width:40, height:40, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:'2px solid rgba(255,255,255,0.2)' }} onError={e=>{e.target.style.display='none'; e.target.nextSibling.style.display='flex'}} />
              : null}
            <div style={{ ...S.empAvatar, display: user?.erp_photo_url ? 'none' : 'flex' }}>{user?.display_name?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'}</div>
            <div>
              <div style={S.empName}>{user?.display_name}</div>
              <div style={S.empRole}>{user?.is_sysadmin ? 'System Administrator' : user?.erp_employee_id || 'Employee'}</div>
              <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
                <Icon name={user?.erp_linked ? 'checkCircle' : 'xCircle'} size={11} color={user?.erp_linked ? c.green : c.textMuted} />
                <span style={{ fontSize:10, color: user?.erp_linked ? c.green : c.textMuted, fontWeight:600 }}>
                  {user?.erp_linked ? 'ERP Linked' : 'Not linked to ERP'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Services */}
      <div style={S.section}>
        <div style={S.sectionHeader}>
          <div style={S.sectionTitle}>Services</div>
        </div>
        <div style={S.grid}>
          {mainServices.map(svc => (
            <ServiceTile key={svc.id} svc={svc} onClick={() => handleTile(svc)} />
          ))}
        </div>
      </div>

      {/* Admin section */}
      {adminServices.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionHeader}>
            <div style={S.sectionTitle}>Administration</div>
          </div>
          <div style={S.grid}>
            {adminServices.map(svc => (
              <ServiceTile key={svc.id} svc={svc} onClick={() => handleTile(svc)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ServiceTile({ svc, onClick }) {
  return (
    <div style={{ ...S.tile, ...(svc.soon ? S.tileSoon : {}) }} onClick={onClick} role={svc.soon ? undefined : 'button'} tabIndex={svc.soon ? undefined : 0}
      onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div style={{ ...S.tileIconWrap, background: svc.colorBg }}>
        <Icon name={svc.icon} size={22} color={svc.color} />
      </div>
      <div style={S.tileBody}>
        <div style={S.tileLabel}>{svc.label}</div>
        <div style={S.tileDesc}>{svc.desc}</div>
      </div>
      <div style={S.tileArrow}>
        {svc.soon
          ? <span style={S.soonBadge}>Soon</span>
          : <Icon name="arrowRight" size={14} color={c.textMuted} />}
      </div>
    </div>
  )
}

const S = {
  page: { fontFamily:c.font, animation:'fadeIn 0.2s ease', width:'100%' },
  banner: {
    background:c.navy, borderRadius:14, padding:'24px 28px',
    display:'flex', justifyContent:'space-between', alignItems:'center',
    flexWrap:'wrap', gap:20, marginBottom:28, boxShadow:c.md,
  },
  bannerLeft: {},
  bannerGreeting: { fontSize:22, fontWeight:800, color:'#fff', marginBottom:4 },
  bannerSub: { fontSize:13, color:'rgba(255,255,255,0.45)' },
  bannerRight: {},
  empCard: { display:'flex', alignItems:'center', gap:12, background:'rgba(255,255,255,0.07)', borderRadius:10, padding:'10px 14px', border:'1px solid rgba(255,255,255,0.1)' },
  empAvatar: { width:40, height:40, borderRadius:'50%', background:c.primary, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, flexShrink:0 },
  empName: { fontSize:13, fontWeight:700, color:'#fff' },
  empRole: { fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:1 },

  section: { marginBottom:28 },
  sectionHeader: { marginBottom:12 },
  sectionTitle: { fontSize:11, fontWeight:700, color:c.textMuted, textTransform:'uppercase', letterSpacing:'0.8px' },

  grid: {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))',
    gap:10,
  },
  tile: {
    background:c.surface, borderRadius:12, padding:'16px',
    border:`1px solid ${c.border}`, cursor:'pointer',
    display:'flex', alignItems:'center', gap:14,
    transition:'all 0.15s', boxShadow:c.sm,
  },
  tileSoon: { opacity:0.55, cursor:'default' },
  tileIconWrap: { width:44, height:44, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  tileBody: { flex:1, minWidth:0 },
  tileLabel: { fontSize:13, fontWeight:700, color:c.text, marginBottom:2 },
  tileDesc: { fontSize:11, color:c.textMuted, lineHeight:1.4 },
  tileArrow: { flexShrink:0 },
  soonBadge: { fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:10, background:c.bgDeep, color:c.textMuted, textTransform:'uppercase', letterSpacing:'0.5px' },
}
