import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import BottomSheet from '@/components/ui/BottomSheet'
import { attendanceAPI } from '@/services/api'

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos.coords),
      err => reject(new Error(err.message || 'Could not get your location.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

// mode: 'in' | 'out'. openRecord is required for 'out' (the caller's
// current open ClockRecord, to show which project it'll close).
export default function CheckInSheet({ open, mode, openRecord, onClose, onDone }) {
  const [sites, setSites] = useState([])
  const [siteId, setSiteId] = useState('')
  const [note, setNote] = useState('')
  const [overtimeHours, setOvertimeHours] = useState('')
  const [loadingSites, setLoadingSites] = useState(false)
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || mode !== 'in') return
    setLoadingSites(true)
    attendanceAPI.sites()
      .then(({ data }) => setSites(data.sites || []))
      .catch(() => toast.error('Failed to load project sites'))
      .finally(() => setLoadingSites(false))
  }, [open, mode])

  useEffect(() => {
    if (!open) { setSiteId(''); setNote(''); setOvertimeHours('') }
  }, [open])

  const handleSubmit = async () => {
    if (mode === 'in' && !siteId) {
      toast.error('Select a project site first.')
      return
    }
    setLocating(true)
    let coords
    try {
      coords = await getPosition()
    } catch (e) {
      toast.error(e.message)
      setLocating(false)
      return
    }
    setLocating(false)
    setSubmitting(true)
    try {
      if (mode === 'in') {
        await attendanceAPI.clockIn({
          project_id: siteId,
          lat: coords.latitude, lon: coords.longitude, accuracy_m: coords.accuracy,
          note,
        })
        toast.success('Clocked in')
      } else {
        await attendanceAPI.clockOut({
          record_id: openRecord.id,
          lat: coords.latitude, lon: coords.longitude, accuracy_m: coords.accuracy,
          overtime_hours_requested: overtimeHours ? Number(overtimeHours) : 0,
        })
        toast.success('Clocked out')
      }
      onDone()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const busy = locating || submitting

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === 'in' ? 'Check In' : 'Check Out'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {mode === 'in' ? (
          <div>
            <label style={labelStyle}>Project Site</label>
            {loadingSites ? (
              <div style={{ fontSize: 13, color: c.textMuted, padding: '8px 0' }}>Loading sites…</div>
            ) : sites.length === 0 ? (
              <div style={{ fontSize: 13, color: c.textMuted, padding: '8px 0' }}>No active project sites found.</div>
            ) : (
              <select value={siteId} onChange={e => setSiteId(e.target.value)} style={inputStyle}>
                <option value="" disabled>Select a site…</option>
                {sites.map(s => (
                  <option key={s.name} value={s.name}>{s.project_name || s.name}</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div style={{ padding: '12px 14px', background: c.bg, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{openRecord?.project_name}</div>
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
              Clocked in {openRecord?.clock_in ? new Date(openRecord.clock_in).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
          </div>
        )}

        {mode === 'in' && (
          <div>
            <label style={labelStyle}>Note <span style={{ fontWeight: 400, textTransform: 'none', color: c.textMuted }}>(optional)</span></label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. covering the east block today" style={inputStyle} />
          </div>
        )}

        {mode === 'out' && (
          <div>
            <label style={labelStyle}>Overtime Hours <span style={{ fontWeight: 400, textTransform: 'none', color: c.textMuted }}>(optional)</span></label>
            <input
              type="number" min="0" step="0.5" inputMode="decimal"
              value={overtimeHours} onChange={e => setOvertimeHours(e.target.value)}
              placeholder="0" style={inputStyle}
            />
            <p style={{ fontSize: 11, color: c.textMuted, marginTop: 6 }}>
              Your supervisor reviews this when they approve your submission.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: c.blueBg, border: `1px solid ${c.blueBorder}`, borderRadius: 8 }}>
          <Icon name="mapPin" size={14} color={c.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 11, color: c.textSub }}>
            We'll use your device's current location to {mode === 'in' ? 'check you in' : 'check you out'}.
          </span>
        </div>

        <button onClick={handleSubmit} disabled={busy} style={{
          width: '100%', padding: '13px', borderRadius: 10, border: 'none',
          background: c.primary, color: '#fff', fontFamily: c.font, fontSize: 14, fontWeight: 700,
          cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {locating ? 'Getting location…' : submitting ? 'Submitting…' : mode === 'in' ? 'Check In' : 'Check Out'}
        </button>
      </div>
    </BottomSheet>
  )
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: c.textSub, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 7 }
const inputStyle = { width: '100%', padding: '10px 14px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 14, color: c.text, background: c.surfaceRaised, fontFamily: c.font, boxSizing: 'border-box' }
