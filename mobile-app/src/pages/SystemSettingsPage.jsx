import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { settingsAPI } from '@/services/api'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import { PageWrap, PageHeader, Card, LoadingBlock } from '@/components/Shared'
import { useLang } from '@/context/LangContext'
import toast from 'react-hot-toast'

function Toggle({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      style={{
        width: 48, height: 26, borderRadius: 13,
        background: enabled ? c.primary : c.borderStrong,
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: enabled ? 25 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

function SettingRow({ icon, iconBg, iconColor, title, desc, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 16, padding: '18px 20px', borderBottom: `1px solid ${c.bg}`,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 200 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={icon} size={18} color={iconColor} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>{title}</div>
          <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

export default function SystemSettingsPage() {
  const { hasPermission } = useAuth()
  const { t } = useLang()
  const canEdit = hasPermission('system.manage_settings')
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await settingsAPI.get()
      setSettings(data.settings)
    } catch {
      // Backend might not have settings yet — use defaults
      setSettings({ qr_timesheet_enabled: true })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleToggle = async (key, value) => {
    if (!canEdit) return
    const updated = { ...settings, [key]: value }
    setSettings(updated)
    setSaving(true)
    try {
      await settingsAPI.update(updated)
      toast.success(t('settings_saved'))
    } catch {
      toast.error('Failed to save settings')
      setSettings(settings) // revert
    } finally { setSaving(false) }
  }

  const qrEnabled = settings?.qr_timesheet_enabled ?? true

  return (
    <PageWrap>
      <PageHeader
        title="System Settings"
        sub="Configure system-wide behaviour for all users"
      />

      {loading ? <LoadingBlock /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Timesheet Mode */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
              Timesheet Mode
            </div>
            <Card>
              <SettingRow
                icon="qr"
                iconBg={qrEnabled ? c.primaryBg : c.bg}
                iconColor={qrEnabled ? c.primary : c.textMuted}
                title="QR-Based Attendance"
                desc={t('qr_attendance_desc')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: qrEnabled ? c.primary : c.textMuted }}>
                    {qrEnabled ? t('enabled') : t('disabled')}
                  </span>
                  <Toggle enabled={qrEnabled} onChange={v => handleToggle('qr_timesheet_enabled', v)} disabled={!canEdit || saving} />
                </div>
              </SettingRow>

              <SettingRow
                icon="edit"
                iconBg={!qrEnabled ? c.primaryBg : c.bg}
                iconColor={!qrEnabled ? c.primary : c.textMuted}
                title="Manual Timesheet Entry"
                desc="Employees can manually enter their own clock-in and clock-out times without requiring a supervisor QR scan."
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: !qrEnabled ? c.primary : c.textMuted }}>
                    {!qrEnabled ? t('enabled') : t('disabled')}
                  </span>
                  <Toggle enabled={!qrEnabled} onChange={v => handleToggle('qr_timesheet_enabled', !v)} disabled={!canEdit || saving} />
                </div>
              </SettingRow>

              {/* Mode explainer */}
              <div style={{
                margin: '0 20px 16px', padding: '12px 14px',
                background: qrEnabled ? c.primaryBg : c.orangeBg,
                border: `1px solid ${qrEnabled ? c.primaryBorder : c.orangeBorder}`,
                borderRadius: 8, fontSize: 12, color: c.textSub, lineHeight: 1.6,
              }}>
                <strong>Current mode: {qrEnabled ? 'QR Attendance' : 'Manual Entry'}</strong>
                <br />
                {qrEnabled
                  ? 'Timesheets are created when a supervisor scans an employee\'s QR code. The "Scan Employee" tab is active for users with the correct permission.'
                  : 'Employees can log their own hours directly from the "My Entries" tab by clicking "Add Entry" and filling in the time and project manually.'}
              </div>
            </Card>
          </div>

          {/* Info */}
          {!canEdit && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 16px', background: c.orangeBg,
              border: `1px solid ${c.orangeBorder}`, borderRadius: 8,
              fontSize: 13, color: c.textSub,
            }}>
              <Icon name="alertCircle" size={15} color={c.orange} />
              You have view-only access to system settings. Contact a system administrator to make changes.
            </div>
          )}

          {/* Permission note */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
              Permission Notes
            </div>
            <Card style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <Icon name="checkCircle" size={14} color={c.green} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span><strong>QR mode:</strong> Requires <code style={{ fontFamily: c.mono, fontSize: 11, background: c.bg, padding: '1px 5px', borderRadius: 4 }}>timesheet.add_record</code> to scan and clock employees in/out.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <Icon name="checkCircle" size={14} color={c.green} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span><strong>Manual mode:</strong> Requires <code style={{ fontFamily: c.mono, fontSize: 11, background: c.bg, padding: '1px 5px', borderRadius: 4 }}>timesheet.add_record</code> to add manual entries on own account.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Icon name="checkCircle" size={14} color={c.green} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>Changing this setting takes effect immediately for all users without requiring a logout.</span>
                </div>
              </div>
            </Card>
          </div>

        </div>
      )}
    </PageWrap>
  )
}
