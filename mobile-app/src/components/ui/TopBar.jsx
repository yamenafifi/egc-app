// Shared mobile top bar — used by all pages for consistent look
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'

function Actions({ user, onAvatarClick }) {
  const navigate = useNavigate()
  const { count } = useUnreadCount()
  const initials = user?.display_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={() => navigate('/notifications')} style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 99 }}>
        <Icon name="bell" size={19} color={c.textSub} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0, minWidth: 15, height: 15, padding: '0 3px',
            background: c.red, color: '#fff', borderRadius: 99,
            fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid #fff', lineHeight: 1,
          }}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      <button onClick={onAvatarClick} style={{
        width: 32, height: 32, borderRadius: '50%',
        background: c.bg, border: `1.5px solid ${c.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: c.textSub,
        overflow: 'hidden', cursor: 'pointer', flexShrink: 0, padding: 0,
      }}>
        {user?.erp_photo_url
          ? <img src={user.erp_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
          : initials
        }
      </button>
    </div>
  )
}

// Main top bar (Home-style) — logo + actions
export function AppTopBar({ user, onAvatarClick }) {
  return (
    <div style={{
      background: '#fff',
      padding: '0 18px',
      height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${c.border}`,
      position: 'sticky', top: 0, zIndex: 50,
      flexShrink: 0,
    }}>
      <img src="/logo.png" alt="EGC" style={{ height: 28, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; e.target.insertAdjacentHTML('afterend', '<span style="font-size:16px;font-weight:800;color:#111">EGC App</span>') }} />
      <Actions user={user} onAvatarClick={onAvatarClick} />
    </div>
  )
}

// Back-style top bar — for sub-pages
export function PageTopBar({ title, onBack, action }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const handleBack = onBack || (() => navigate(-1))
  return (
    <div style={{
      background: '#fff',
      padding: '0 18px 0 6px',
      height: 52,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${c.border}`,
      position: 'sticky', top: 0, zIndex: 50,
      flexShrink: 0,
    }}>
      <button onClick={handleBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px',
        color: c.text, fontSize: 17, fontWeight: 800, fontFamily: c.font,
      }}>
        <Icon name="chevronLeft" size={22} color={c.text} />
        {title}
      </button>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {action}
        <Actions user={user} onAvatarClick={() => navigate('/profile')} />
      </div>
    </div>
  )
}
