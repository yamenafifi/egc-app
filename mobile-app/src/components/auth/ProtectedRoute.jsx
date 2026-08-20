import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'

export default function ProtectedRoute({ children, permission }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100dvh', flexDirection:'column', gap:12 }}>
      <div style={{ width:32, height:32, border:`3px solid ${c.primaryBg}`, borderTopColor:c.primary, borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />
      <span style={{ fontSize:13, color:c.textMuted }}>Loading…</span>
    </div>
  )

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (user.must_change_password && location.pathname !== '/initial-password') return <Navigate to="/initial-password" replace />

  if (permission && !user.is_sysadmin && !user.permissions?.includes(permission)) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'50vh', gap:12, padding:24 }}>
      <Icon name="shield" size={40} color={c.borderStrong} />
      <div style={{ fontSize:16, fontWeight:700, color:c.text }}>Access Denied</div>
      <div style={{ fontSize:13, color:c.textMuted }}>You don't have permission to view this page.</div>
    </div>
  )

  return children
}
