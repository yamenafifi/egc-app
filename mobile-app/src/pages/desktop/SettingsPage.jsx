import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authAPI } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { registerPush, unregisterPush, getPushSubscriptionState } from '@/services/push'
import { PageHeader, Panel, SecondaryButton } from '@/desktop/components/Page'

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-slate-900' : 'bg-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

export default function SettingsPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [pushState, setPushState] = useState('checking')
  const [pushBusy, setPushBusy] = useState(false)

  useEffect(() => { loadDevices() }, [])
  useEffect(() => { getPushSubscriptionState().then(setPushState) }, [])

  const loadDevices = async () => {
    try { const res = await authAPI.getDevices(); setDevices(res.data.devices) }
    catch { toast.error('Failed to load devices') }
    finally { setLoading(false) }
  }

  const handleTogglePush = async () => {
    setPushBusy(true)
    try {
      if (pushState === 'on') { await unregisterPush(); setPushState('off'); toast.success('Push notifications turned off') }
      else { await registerPush(); setPushState('on'); toast.success('Push notifications enabled') }
    } catch (e) { toast.error(e.message || 'Could not update push notification settings') }
    finally { setPushBusy(false) }
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
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to remove device') }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />

      <div className="flex flex-col gap-5">
        <Panel>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Icon name="lock" size={16} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Password</span>
            </div>
            <SecondaryButton onClick={() => navigate('/change-password')}>Change Password</SecondaryButton>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">Push Notifications</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {pushState === 'unsupported' ? 'Not supported in this browser.'
                  : pushState === 'on' ? 'Enabled on this device.'
                  : 'Get notified instantly, even when the app is closed.'}
              </div>
            </div>
            <Toggle checked={pushState === 'on'} onChange={handleTogglePush} disabled={pushBusy || pushState === 'checking' || pushState === 'unsupported'} />
          </div>
        </Panel>

        <Panel title="Active Devices">
          {loading ? (
            <div className="py-6 text-center text-sm text-slate-400">Loading devices…</div>
          ) : devices.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">No devices found.</div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100">
              {devices.map(device => (
                <div key={device.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{device.device_name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{device.ip_address ? `IP: ${device.ip_address}` : 'Local Network'}</div>
                    {device.extra_info && Object.keys(device.extra_info).length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400 mt-1">
                        {device.extra_info.platform && <span><b className="font-medium text-slate-500">Platform:</b> {device.extra_info.platform}</span>}
                        {device.extra_info.screenResolution && <span><b className="font-medium text-slate-500">Screen:</b> {device.extra_info.screenResolution}</span>}
                        {device.extra_info.timeZone && <span><b className="font-medium text-slate-500">Timezone:</b> {device.extra_info.timeZone}</span>}
                        {device.extra_info.language && <span><b className="font-medium text-slate-500">Lang:</b> {device.extra_info.language}</span>}
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1">Last active: {new Date(device.last_active).toLocaleString()}</div>
                  </div>
                  <SecondaryButton tone="danger" onClick={() => handleRemoveDevice(device.id)}>Remove</SecondaryButton>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
