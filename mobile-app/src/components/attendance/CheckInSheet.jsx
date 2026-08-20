import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { c } from '@/theme'
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

function haversineDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = deg => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Nearest site by straight-line distance, not "the one whose geofence you're
// inside" - if nobody's geofence contains you (bad GPS, a genuinely offsite
// task), the closest site is still the best guess, and the server's own
// geofence_status check (computed against the real radius once a project_id
// is chosen) is what actually flags it for the reviewing supervisor. This
// mirrors clock-in's existing soft-check philosophy: never block, just flag.
function nearestSite(sites, lat, lon) {
  let best = null
  let bestDist = Infinity
  for (const s of sites) {
    if (s.latitude == null || s.longitude == null) continue
    const d = haversineDistanceM(lat, lon, s.latitude, s.longitude)
    if (d < bestDist) { bestDist = d; best = s }
  }
  return best
}

// mode: 'in' | 'out'. openRecord is required for 'out' (the caller's
// current open ClockRecord, to show which project it'll close).
export default function CheckInSheet({ open, mode, openRecord, onClose, onDone }) {
  const [sites, setSites] = useState([])
  const [loadingSites, setLoadingSites] = useState(false)
  const [overtimeHours, setOvertimeHours] = useState('')
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!open || mode !== 'in') return
    setLoadingSites(true)
    attendanceAPI.sites()
      .then(({ data }) => setSites(data.sites || []))
      .catch(() => toast.error('Failed to load project sites'))
      .finally(() => setLoadingSites(false))
  }, [open, mode])

  useEffect(() => {
    if (!open) { setOvertimeHours(''); return }
    if (mode !== 'in') return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [open, mode])

  const handleSubmit = async () => {
    if (mode === 'in' && sites.length === 0) {
      toast.error('No active project sites are configured. Contact your admin.')
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
        const site = nearestSite(sites, coords.latitude, coords.longitude)
        if (!site) {
          toast.error('Could not determine your project site. Contact your admin.')
          setSubmitting(false)
          return
        }
        await attendanceAPI.clockIn({
          project_id: site.name,
          lat: coords.latitude, lon: coords.longitude, accuracy_m: coords.accuracy,
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
  const disabled = busy || (mode === 'in' && (loadingSites || sites.length === 0))

  const buttonLabel = locating ? 'Getting location…'
    : submitting ? (mode === 'in' ? 'Checking in…' : 'Checking out…')
    : mode === 'in' && loadingSites ? 'Loading…'
    : mode === 'in' && sites.length === 0 ? 'No sites available'
    : mode === 'in' ? 'Check In' : 'Check Out'

  return (
    <BottomSheet open={open} onClose={onClose} title={mode === 'in' ? 'Check In' : 'Check Out'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {mode === 'in' ? (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: c.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
              {new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>
              {new Date(now).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 14px', background: c.bg, borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{openRecord?.project_name}</div>
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
              Clocked in {openRecord?.clock_in ? new Date(openRecord.clock_in).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
            </div>
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

        <button onClick={handleSubmit} disabled={disabled} style={{
          width: '100%', padding: '13px', borderRadius: 10, border: 'none',
          background: c.primaryDark, color: '#fff', fontFamily: c.font, fontSize: 14, fontWeight: 700,
          cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {buttonLabel}
        </button>
      </div>
    </BottomSheet>
  )
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: c.textSub, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 7 }
const inputStyle = { width: '100%', padding: '10px 14px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 14, color: c.text, background: c.surfaceRaised, fontFamily: c.font, boxSizing: 'border-box' }
