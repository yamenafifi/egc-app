import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import BottomSheet from '@/components/ui/BottomSheet'
import { StatusBadge } from './RequestRow'
import { attendanceAPI, leaveAPI } from '@/services/api'

const GEOFENCE_LABEL = { inside: 'Inside geofence', outside: 'Outside geofence', no_geofence: 'No geofence set' }
const GEOFENCE_COLOR = { inside: c.green, outside: c.red, no_geofence: c.textMuted }

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Row({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: c.text }}>{value}</div>
    </div>
  )
}

function btnStyle(kind) {
  const base = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: c.font, border: 'none' }
  if (kind === 'approve') return { ...base, background: c.green, color: '#fff' }
  if (kind === 'reject') return { ...base, background: c.redBg, color: c.red, border: `1px solid ${c.redBorder}` }
  return { ...base, background: c.surface, color: c.textSub, border: `1px solid ${c.border}` }
}

// item: a normalized request from utils/requests.js (or null to close).
// mode: 'mine' | 'team' — only 'team' ever shows Approve/Reject (the
// server re-checks authority regardless; this is UI polish only).
export default function RequestDetailSheet({ item, mode, onClose, onActioned }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDetail(null)
    setRejecting(false)
    setNote('')
    if (!item || item.kind !== 'attendance') return
    setLoading(true)
    attendanceAPI.getSubmission(item.id)
      .then(({ data }) => setDetail(data))
      .catch(() => toast.error('Failed to load submission detail'))
      .finally(() => setLoading(false))
  }, [item])

  if (!item) return null

  const canAct = mode === 'team' && item.status === 'pending'

  const handleApprove = async () => {
    setBusy(true)
    try {
      if (item.kind === 'leave') await leaveAPI.approve(item.id)
      else await attendanceAPI.approveSubmission(item.id, {})
      toast.success('Approved')
      onActioned()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to approve')
    } finally { setBusy(false) }
  }

  const handleReject = async () => {
    if (item.kind === 'attendance' && !note.trim()) {
      toast.error('A reason is required to reject.')
      return
    }
    setBusy(true)
    try {
      if (item.kind === 'leave') await leaveAPI.reject(item.id, note || undefined)
      else await attendanceAPI.rejectSubmission(item.id, note)
      toast.success('Rejected')
      onActioned()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to reject')
    } finally { setBusy(false) }
  }

  return (
    <BottomSheet open={!!item} onClose={onClose} title={item.kind === 'leave' ? 'Leave Request' : 'Attendance Submission'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.text }}>{item.title}</div>
            <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.subtitle}</div>
          </div>
          <StatusBadge status={item.status} />
        </div>

        {item.raw.display_name && <Row label="Employee" value={item.raw.display_name} />}

        {item.kind === 'leave' ? (
          <>
            <Row label="Reason" value={item.raw.reason || '—'} />
            <Row label="Approver" value={item.raw.leave_approver_name || '—'} />
            {item.raw.action_remarks && <Row label="Remarks" value={item.raw.action_remarks} />}
          </>
        ) : (
          <>
            {item.pushWarning && (
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: c.orangeBg, border: `1px solid ${c.orangeBorder}`, borderRadius: 8 }}>
                <Icon name="alertCircle" size={14} color={c.orange} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: c.textSub }}>
                  Approved, but this didn't fully reach payroll ({item.raw.push_status}). It may need manual correction in egc_hr.
                </span>
              </div>
            )}
            {item.raw.review_note && <Row label="Review note" value={item.raw.review_note} />}

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
                Clock Records
              </div>
              {loading ? (
                <div style={{ fontSize: 12, color: c.textMuted, padding: '8px 0' }}>Loading…</div>
              ) : !detail?.records?.length ? (
                <div style={{ fontSize: 12, color: c.textMuted, padding: '8px 0' }}>No records.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {detail.records.map(rec => (
                    <div key={rec.id} style={{ padding: '10px 12px', background: c.surfaceRaised, border: `1px solid ${c.border}`, borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: c.text }}>
                        <span>{rec.project_name}</span>
                        <span>{rec.hours != null ? `${rec.hours}h` : '—'}</span>
                      </div>
                      <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>
                        {fmtDateTime(rec.clock_in)} → {fmtDateTime(rec.clock_out)}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: GEOFENCE_COLOR[rec.geofence_status] || c.textMuted }}>
                          <Icon name="mapPin" size={10} color={GEOFENCE_COLOR[rec.geofence_status] || c.textMuted} />
                          {GEOFENCE_LABEL[rec.geofence_status] || 'Unknown'}
                        </span>
                        {rec.overtime_hours_requested > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: c.blue }}>OT requested: {rec.overtime_hours_requested}h</span>
                        )}
                      </div>
                      {rec.note && <div style={{ fontSize: 11, color: c.textSub, marginTop: 5, fontStyle: 'italic' }}>"{rec.note}"</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {canAct && (
          rejecting ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                placeholder={item.kind === 'attendance' ? 'Reason for rejecting (required)' : 'Reason for rejecting (optional)'}
                value={note} onChange={e => setNote(e.target.value)} rows={3}
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 13, fontFamily: c.font, resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setRejecting(false)} style={btnStyle('cancel')}>Cancel</button>
                <button onClick={handleReject} disabled={busy} style={btnStyle('reject')}>
                  {busy ? 'Rejecting…' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setRejecting(true)} disabled={busy} style={btnStyle('reject')}>
                <Icon name="xCircle" size={14} color={c.red} /> Reject
              </button>
              <button onClick={handleApprove} disabled={busy} style={btnStyle('approve')}>
                <Icon name="checkCircle" size={14} color="#fff" /> {busy ? 'Approving…' : 'Approve'}
              </button>
            </div>
          )
        )}
      </div>
    </BottomSheet>
  )
}
