import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import toast from 'react-hot-toast'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const isMobile = useIsMobile()
  
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(false)

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      const res = await authAPI.getDevices()
      setDevices(res.data.devices)
    } catch (err) {
      toast.error('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveDevice = async (id) => {
    try {
      const res = await authAPI.revokeDevice(id)
      if (res.data.self_revoked) {
        toast.error('Current session revoked.')
        await logout()
        navigate('/login')
        return
      }
      toast.success('Device removed')
      setDevices(prev => prev.filter(d => d.id !== id))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove device')
    }
  }

  const content = (
    <div style={{ padding: isMobile ? '20px 16px' : '20px 0', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 600 }}>
      
      {/* Change Password Block */}
      <div 
        onClick={() => navigate('/change-password')}
        style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxShadow: c.sm }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="lock" size={18} color={c.textSub} />
          <span style={{ fontSize: 15, fontWeight: 500, color: c.text }}>Change Password</span>
        </div>
        <Icon name="chevronRight" size={20} color={c.borderStrong} />
      </div>

      {/* Push Notifications Block */}
      <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8, boxShadow: c.sm }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: c.text }}>Enable Push Notifications</span>
          
          {/* Toggle Switch */}
          <div 
            onClick={() => setPushEnabled(!pushEnabled)}
            style={{ 
              width: 44, height: 24, borderRadius: 12, 
              background: pushEnabled ? c.primary : c.borderStrong, 
              position: 'relative', cursor: 'pointer', transition: 'background 0.2s' 
            }}
          >
            <div style={{ 
              width: 20, height: 20, borderRadius: '50%', background: '#fff', 
              position: 'absolute', top: 2, left: pushEnabled ? 22 : 2, 
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' 
            }} />
          </div>
        </div>
        <span style={{ fontSize: 13, color: c.textMuted, lineHeight: 1.4 }}>
          {pushEnabled ? 'Push notifications are enabled on your device.' : 'Push notifications have been disabled on your site'}
        </span>
      </div>

      {/* Active Devices Block */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 12, paddingLeft: 4 }}>Active Devices</h2>
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: c.sm, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: c.textMuted, fontSize: 14 }}>Loading devices...</div>
          ) : devices.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: c.textMuted, fontSize: 14 }}>No devices found.</div>
          ) : (
            devices.map((device, idx) => (
              <div key={device.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: idx < devices.length - 1 ? `1px solid ${c.bg}` : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{device.device_name}</div>
                  <div style={{ fontSize: 13, color: c.textMuted }}>
                    {device.ip_address !== "" ? `IP: ${device.ip_address}` : "Local Network"}
                  </div>
                  {device.extra_info && Object.keys(device.extra_info).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12, color: c.textSub, marginTop: 2 }}>
                      {device.extra_info.platform && <span><b style={{fontWeight:500}}>Platform:</b> {device.extra_info.platform}</span>}
                      {device.extra_info.screenResolution && <span><b style={{fontWeight:500}}>Screen:</b> {device.extra_info.screenResolution}</span>}
                      {device.extra_info.timeZone && <span><b style={{fontWeight:500}}>Timezone:</b> {device.extra_info.timeZone}</span>}
                      {device.extra_info.language && <span><b style={{fontWeight:500}}>Lang:</b> {device.extra_info.language}</span>}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: c.textMuted, marginTop: 4 }}>Last Active: {new Date(device.last_active).toLocaleString()}</div>
                </div>
                <button 
                  onClick={() => handleRemoveDevice(device.id)}
                  style={{ background: c.redBg, color: c.red, border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )

  return (
    <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
      {isMobile ? <PageTopBar title="Settings" /> : <h1 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 800, color: c.text }}>Settings</h1>}
      {content}
    </div>
  )
}
