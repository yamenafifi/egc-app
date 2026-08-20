import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAuth } from '@/context/AuthContext'
import { attendanceAPI, leaveAPI } from '@/services/api'
import { normalizeSubmission, sortByMostRecent } from '@/utils/requests'
import AttendanceCalendar from '@/components/attendance/AttendanceCalendar'
import RequestRow from '@/components/requests/RequestRow'
import RequestDetailSheet from '@/components/requests/RequestDetailSheet'

function UnsubmittedSection({ records, onSubmitted }) {
  const [selected, setSelected] = useState(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { setSelected(new Set(records.map(r => r.id))) }, [records])

  if (records.length === 0) return null

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const handleSubmit = async () => {
    if (selected.size === 0) return toast.error('Select at least one record.')
    setSubmitting(true)
    try {
      await attendanceAPI.createSubmission([...selected])
      toast.success('Submitted for approval')
      onSubmitted()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: c.text, marginBottom: 10 }}>Unsubmitted Attendance</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {records.map(rec => (
          <label key={rec.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: c.bg, borderRadius: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.has(rec.id)} onChange={() => toggle(rec.id)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: c.text }}>{rec.project_name}</div>
              <div style={{ fontSize: 11, color: c.textMuted }}>
                {rec.clock_in ? new Date(rec.clock_in).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''} · {rec.hours ?? '—'}h
                {rec.overtime_hours_requested > 0 && ` · ${rec.overtime_hours_requested}h OT`}
              </div>
            </div>
          </label>
        ))}
      </div>
      <button onClick={handleSubmit} disabled={submitting} style={{
        width: '100%', padding: '10px', borderRadius: 8, border: 'none',
        background: c.primaryDark, color: '#fff', fontFamily: c.font, fontSize: 13, fontWeight: 700,
        cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
      }}>
        {submitting ? 'Submitting…' : `Submit ${selected.size} Record${selected.size !== 1 ? 's' : ''}`}
      </button>
    </div>
  )
}

export default function AttendancePage() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState(searchParams.get('tab') === 'team' ? 'team' : 'mine')
  const [records, setRecords] = useState([])
  const [approvedLeaves, setApprovedLeaves] = useState([])
  const [unsubmitted, setUnsubmitted] = useState([])
  const [mineItems, setMineItems] = useState(null)
  const [teamItems, setTeamItems] = useState(null)
  const [pendingFinalCount, setPendingFinalCount] = useState(0)
  const [selected, setSelected] = useState(null)
  const [autoOpenChecked, setAutoOpenChecked] = useState(false)

  const canFinalApprove = hasPermission('attendance.final_approve')

  const loadMine = useCallback(async () => {
    try {
      const { data } = await attendanceAPI.myRecords()
      setRecords(data.records || [])
      setUnsubmitted((data.records || []).filter(r => r.status === 'closed'))
      setMineItems(sortByMostRecent((data.submissions || []).map(normalizeSubmission)))
    } catch {
      setMineItems([])
    }
  }, [])

  const loadApprovedLeaves = useCallback(async () => {
    try {
      const { data } = await leaveAPI.myRequests()
      setApprovedLeaves((data.requests || []).filter(r => r.status === 'Approved'))
    } catch {
      setApprovedLeaves([])
    }
  }, [])

  const loadTeam = useCallback(async () => {
    try {
      const { data } = await attendanceAPI.teamSubmissions()
      setTeamItems(sortByMostRecent((data.submissions || []).map(normalizeSubmission)))
    } catch {
      setTeamItems([])
    }
  }, [])

  const loadFinalCount = useCallback(async () => {
    if (!canFinalApprove) return
    try {
      const { data } = await attendanceAPI.pendingFinalApproval()
      setPendingFinalCount((data.submissions || []).length)
    } catch {
      setPendingFinalCount(0)
    }
  }, [canFinalApprove])

  useEffect(() => { loadMine(); loadApprovedLeaves(); loadTeam(); loadFinalCount() }, [loadMine, loadApprovedLeaves, loadTeam, loadFinalCount])

  useEffect(() => {
    if (autoOpenChecked) return
    const list = tab === 'mine' ? mineItems : teamItems
    if (list === null) return
    const subId = searchParams.get('submission')
    if (subId) {
      const found = list.find(i => i.id === subId)
      if (found) setSelected({ item: found, mode: tab })
    }
    setAutoOpenChecked(true)
  }, [mineItems, teamItems, tab, searchParams, autoOpenChecked])

  const handleActioned = () => { loadMine(); loadTeam(); loadFinalCount() }
  const handleTabChange = (key) => { setTab(key); setSearchParams({ tab: key }) }

  const activeItems = tab === 'mine' ? mineItems : teamItems

  const body = (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 16 }}>
        <AttendanceCalendar records={records} approvedLeaves={approvedLeaves} />
      </div>

      {canFinalApprove && (
        <button onClick={() => navigate('/attendance/final-approval')} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
          background: pendingFinalCount > 0 ? c.blueBg : '#fff', border: `1px solid ${pendingFinalCount > 0 ? c.blueBorder : c.border}`,
          borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: c.font, marginBottom: 16,
        }}>
          <Icon name="checkCircle" size={18} color={c.blue} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>Final Approval</div>
            <div style={{ fontSize: 11, color: c.textMuted, marginTop: 1 }}>
              {pendingFinalCount > 0 ? `${pendingFinalCount} submission${pendingFinalCount !== 1 ? 's' : ''} awaiting your review` : 'Nothing pending'}
            </div>
          </div>
          <Icon name="chevronRight" size={14} color={c.textMuted} />
        </button>
      )}

      {tab === 'mine' && <UnsubmittedSection records={unsubmitted} onSubmitted={loadMine} />}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['mine', 'My Attendance'], ['team', 'Team']].map(([key, label]) => (
          <button key={key} onClick={() => handleTabChange(key)} style={{
            flex: 1, textAlign: 'center', padding: '10px 0', cursor: 'pointer',
            background: tab === key ? c.primaryDark : '#fff',
            borderRadius: 10, fontSize: 13, fontWeight: 700,
            color: tab === key ? '#fff' : c.textSub,
            border: `1px solid ${tab === key ? c.primaryDark : c.border}`,
            fontFamily: c.font,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {activeItems === null ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
        ) : activeItems.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>
            {tab === 'mine' ? 'No submissions yet' : 'No submissions need your review'}
          </div>
        ) : (
          activeItems.map(item => (
            <RequestRow key={item.id} item={item} onClick={() => setSelected({ item, mode: tab })} />
          ))
        )}
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Attendance" />
        <div style={{ padding: '20px 16px 40px' }}>{body}</div>
        <RequestDetailSheet item={selected?.item} mode={selected?.mode} onClose={() => setSelected(null)} onActioned={handleActioned} />
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Attendance</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>Your attendance calendar and submissions, and anything awaiting your review.</p>
      </div>
      {body}
      <RequestDetailSheet item={selected?.item} mode={selected?.mode} onClose={() => setSelected(null)} onActioned={handleActioned} />
    </div>
  )
}
