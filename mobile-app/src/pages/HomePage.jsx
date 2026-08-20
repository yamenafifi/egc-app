import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import MenuList from '@/components/ui/MenuList'
import { AppTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const firstName = user?.en_display_name?.split(' ')[0]
    || user?.display_name?.split(' ').pop()
    || 'there'

  const quickLinks = [
    { icon: 'user',        label: 'Request Attendance', onClick: () => {} },
    { icon: 'clock',       label: 'Request a Shift',    onClick: () => {} },
    { icon: 'calendar',    label: 'Request Leave',      onClick: () => {} },
    { icon: 'dollarSign',  label: 'Claim an Expense',   onClick: () => {} },
    { icon: 'creditCard',  label: 'Request an Advance', onClick: () => {} },
    { icon: 'fileText',    label: 'View Salary Slips',  onClick: () => {} },
  ]

  const content = (
    <div style={{ padding: isMobile ? '16px 16px 32px' : '0', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: isMobile ? '100%' : 640 }}>

      {/* Greeting card */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: `1px solid ${c.border}` }}>
        <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: c.text, marginBottom: 1 }}>
          Hey, {firstName} 👋
        </div>
        {user?.display_name && (
          <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 14, direction: 'rtl', textAlign: 'left' }}>
            {user.display_name}
          </div>
        )}
        <button disabled style={{
          width: '100%', padding: '11px',
          background: c.bg, border: `1px solid ${c.border}`,
          borderRadius: 10, cursor: 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: c.font, fontSize: 14, fontWeight: 500, color: c.textMuted,
        }}>
          Check In <Icon name="arrowRightCircle" size={16} color={c.textMuted} />
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: c.textMuted, marginTop: 6 }}>
          Attendance — coming soon
        </div>
      </div>

      {/* Quick Links */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: c.text, marginBottom: 12, paddingLeft: 4 }}>Quick Links</div>
        <MenuList items={quickLinks} />
      </div>

      {/* Requests */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: c.text, marginBottom: 12, paddingLeft: 4 }}>Requests</div>
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
          <div style={{ display: 'flex', padding: '10px 10px 0', gap: 6 }}>
            {['My Requests', 'Team Requests'].map((label, i) => (
              <div key={label} style={{
                flex: 1, textAlign: 'center', padding: '8px 0',
                background: i === 0 ? '#fff' : 'none',
                borderRadius: 9, fontSize: 13, fontWeight: i === 0 ? 700 : 500,
                color: i === 0 ? c.text : c.textMuted,
                boxShadow: i === 0 ? c.sm : 'none',
                border: i === 0 ? `1px solid ${c.border}` : 'none',
              }}>{label}</div>
            ))}
          </div>
          <div style={{ padding: '24px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>
            You have no requests
          </div>
        </div>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <AppTopBar user={user} onAvatarClick={() => navigate('/profile')} />
        {content}
      </div>
    )
  }

  // Desktop — no mobile top bar, just content inside the AppLayout main area
  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Home</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>Welcome back, {user?.en_display_name || user?.display_name}</p>
      </div>
      {content}
    </div>
  )
}
