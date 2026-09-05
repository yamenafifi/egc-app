import { useState, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import MenuList from '@/components/ui/MenuList'
import BottomSheet from '@/components/ui/BottomSheet'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
const DesktopProfilePage = lazy(() => import('@/pages/desktop/ProfilePage')) // see App.jsx's top comment - split out of the initial bundle

function DetailSheet({ open, onClose, title, rows }) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: `1px solid ${c.bg}` }}>
            <span style={{ fontSize: 13, color: c.textMuted, fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 13, color: c.text, fontWeight: 600, textAlign: 'right', maxWidth: '58%' }}>{value}</span>
          </div>
        ))}
      </div>
    </BottomSheet>
  )
}

function MobileProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(null)
  const [photoErr, setPhotoErr] = useState(false)

  const initials = user?.display_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  // Already a full URL - resolved server-side (auth_service.py) against
  // the live-configured ERPNext base URL, never rebuilt here.
  const photoSrc = user?.erp_photo_url
  const handleLogout = async () => { await logout(); navigate('/login') }

  const profileMenu = [
    { icon: 'user',       label: 'Employee Details',    onClick: () => setSheet('employee') },
    { icon: 'creditCard', label: 'Contact Information', onClick: () => setSheet('contact') },
  ]
  const settingsMenu = [
    { icon: 'settings', label: 'Settings', onClick: () => navigate('/settings') },
  ]
  const employeeRows = [
    ['Full Name (EN)', user?.en_display_name || user?.display_name],
    ['Full Name (AR)', user?.display_name],
    ['Employee ID',   user?.erp_employee_id],
    ['Designation',  user?.designation_en || user?.designation],
    ['Department',   user?.department],
    ['Department (AR)', user?.department_ar],
    ['IQAMA No.',    user?.iqama_number],
  ]
  const contactRows = [
    ['IQAMA No.', user?.iqama_number],
    ['Username',  user?.username],
  ]

  const avatar = (size = 84, fontSize = 26) => (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: c.bg, border: `1.5px solid ${c.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 700, color: c.textSub, overflow: 'hidden', flexShrink: 0,
    }}>
      {photoSrc && !photoErr
        ? <img src={photoSrc} alt="" onError={() => setPhotoErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials}
    </div>
  )

  const sheets = (
    <>
      <DetailSheet open={sheet === 'employee'} onClose={() => setSheet(null)} title="Employee Details"    rows={employeeRows} />
      <DetailSheet open={sheet === 'contact'}  onClose={() => setSheet(null)} title="Contact Information" rows={contactRows} />
    </>
  )

  return (
    <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
      <PageTopBar title="Profile" />
      <div style={{ padding: '24px 16px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 8 }}>
          {avatar()}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: c.text }}>{user?.en_display_name || user?.display_name}</div>
            {user?.en_display_name && <div style={{ fontSize: 13, color: c.textMuted, marginTop: 2, direction: 'rtl' }}>{user.display_name}</div>}
            {(user?.designation_en || user?.designation) && <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>{user.designation_en || user.designation}</div>}
          </div>
        </div>
        <MenuList items={profileMenu} />
        <MenuList items={settingsMenu} />
        <button onClick={handleLogout} style={{ width: '100%', padding: '14px', background: '#fff', border: `1px solid ${c.redBorder}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: c.font, fontSize: 14, fontWeight: 500, color: c.red }}>
          <Icon name="logout" size={16} color={c.red} /> Log Out
        </button>
      </div>
      {sheets}
    </div>
  )
}

export default function ProfilePage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileProfilePage /> : <DesktopProfilePage />
}
