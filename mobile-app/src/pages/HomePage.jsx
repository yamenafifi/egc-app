import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import MenuList from '@/components/ui/MenuList'
import { AppTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { attendanceAPI, leaveAPI } from '@/services/api'
import { normalizeLeaveRequest, normalizeSubmission, sortByMostRecent } from '@/utils/requests'
import RequestRow from '@/components/requests/RequestRow'
import RequestDetailSheet from '@/components/requests/RequestDetailSheet'
import CheckInSheet from '@/components/attendance/CheckInSheet'

function formatElapsed(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
}

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [openRecord, setOpenRecord] = useState(undefined) // undefined = loading, null = none
  const [checkSheet, setCheckSheet] = useState(null) // 'in' | 'out' | null
  const [now, setNow] = useState(Date.now())

  const [tab, setTab] = useState('mine')
  const [mineItems, setMineItems] = useState(null)
  const [teamItems, setTeamItems] = useState(null)
  const [selected, setSelected] = useState(null) // { item, mode }
  const [unsubmitted, setUnsubmitted] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const loadOpenRecord = useCallback(async () => {
    try {
      const { data } = await attendanceAPI.myOpenRecord()
      setOpenRecord(data.record)
    } catch {
      setOpenRecord(null)
    }
  }, [])

  const loadMine = useCallback(async () => {
    try {
      const [leaveRes, attRes] = await Promise.all([leaveAPI.myRequests(), attendanceAPI.myRecords()])
      setMineItems(sortByMostRecent([
        ...leaveRes.data.requests.map(normalizeLeaveRequest),
        ...attRes.data.submissions.map(normalizeSubmission),
      ]))
      setUnsubmitted((attRes.data.records || []).filter(r => r.status === 'closed'))
    } catch {
      setMineItems([])
    }
  }, [])

  const loadTeam = useCallback(async () => {
    try {
      const [leaveRes, attRes] = await Promise.all([leaveAPI.teamRequests(), attendanceAPI.teamSubmissions()])
      setTeamItems(sortByMostRecent([
        ...leaveRes.data.requests.map(normalizeLeaveRequest),
        ...attRes.data.submissions.map(normalizeSubmission),
      ]))
    } catch {
      setTeamItems([])
    }
  }, [])

  useEffect(() => { loadOpenRecord(); loadMine(); loadTeam() }, [loadOpenRecord, loadMine, loadTeam])

  useEffect(() => {
    if (!openRecord) return
    const interval = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(interval)
  }, [openRecord])

  const handleActioned = () => { loadMine(); loadTeam() }

  const handleSubmitAll = async () => {
    setSubmitting(true)
    try {
      await attendanceAPI.createSubmission(unsubmitted.map(r => r.id))
      toast.success('Submitted for approval')
      loadMine()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }

  const firstName = user?.en_display_name?.split(' ')[0]
    || user?.display_name?.split(' ').pop()
    || 'there'

  const quickLinks = [
    { icon: 'user',        label: 'Request Attendance', onClick: () => {} },
    { icon: 'clock',       label: 'Request a Shift',    onClick: () => {} },
    { icon: 'calendar',    label: 'Request Leave',      onClick: () => navigate('/leave/new') },
    { icon: 'dollarSign',  label: 'Claim an Expense',   onClick: () => {} },
    { icon: 'creditCard',  label: 'Request an Advance', onClick: () => {} },
    { icon: 'fileText',    label: 'View Salary Slips',  onClick: () => {} },
  ]

  const activeItems = tab === 'mine' ? mineItems : teamItems
  const elapsed = openRecord ? formatElapsed(now - new Date(openRecord.clock_in).getTime()) : null
  const erpLinked = !!user?.erp_employee_id
  const checkInDisabled = openRecord === undefined || !erpLinked

  const content = (
    <div style={{ padding: isMobile ? '16px 16px 32px' : '0', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: isMobile ? '100%' : 640 }}>

      {/* Greeting card */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: `1px solid ${c.border}` }}>
        <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, color: c.text, marginBottom: 1 }}>
          Hey, {firstName} 👋
        </div>
        {user?.display_name && (
          <div style={{ fontSize: 13, color: c.textMuted, marginBottom: 14, direction: 'rtl', textAlign: 'left' }}>
            {user.display_name}
          </div>
        )}
        <button
          disabled={checkInDisabled}
          onClick={() => setCheckSheet(openRecord ? 'out' : 'in')}
          style={{
            width: '100%', padding: '11px',
            background: openRecord ? c.redBg : c.primaryDark,
            border: openRecord ? `1px solid ${c.redBorder}` : 'none',
            borderRadius: 10, cursor: checkInDisabled ? 'default' : 'pointer',
            opacity: checkInDisabled ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: c.font, fontSize: 14, fontWeight: 700, color: openRecord ? c.red : '#fff',
          }}>
          {openRecord ? 'Check Out' : 'Check In'}
          <Icon name={openRecord ? 'stopCircle' : 'arrowRightCircle'} size={16} color={openRecord ? c.red : '#fff'} />
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: c.textMuted, marginTop: 6 }}>
          {openRecord === undefined ? 'Checking status…'
            : !erpLinked ? 'Your account is not linked to an ERP employee record'
            : openRecord ? `${openRecord.project_name} · ${elapsed} elapsed`
            : 'Not clocked in'}
        </div>
      </div>

      {/* Ready to submit */}
      {unsubmitted.length > 0 && (
        <div style={{ background: c.blueBg, borderRadius: 14, padding: '14px 16px', border: `1px solid ${c.blueBorder}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
              {unsubmitted.length} record{unsubmitted.length !== 1 ? 's' : ''} ready to submit
            </div>
            <div style={{ fontSize: 11, color: c.textSub, marginTop: 1 }}>
              {unsubmitted.reduce((sum, r) => sum + (r.hours || 0), 0).toFixed(2)}h total · <button onClick={() => navigate('/requests')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.blue, fontWeight: 600, fontFamily: c.font, fontSize: 11, textDecoration: 'underline' }}>review individually</button>
            </div>
          </div>
          <button onClick={handleSubmitAll} disabled={submitting} style={{
            flexShrink: 0, padding: '9px 14px', borderRadius: 8, border: 'none',
            background: c.blue, color: '#fff', fontFamily: c.font, fontSize: 12, fontWeight: 700,
            cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
          }}>
            {submitting ? 'Submitting…' : 'Submit All'}
          </button>
        </div>
      )}

      {/* Quick Links */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: c.text, marginBottom: 12, paddingLeft: 4 }}>Quick Links</div>
        <MenuList items={quickLinks} />
      </div>

      {/* Requests */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: c.text }}>Requests</div>
          <button onClick={() => navigate('/requests')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: c.textSub, fontFamily: c.font }}>
            View all
          </button>
        </div>
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
          <div style={{ display: 'flex', padding: '10px 10px 0', gap: 6 }}>
            {[['mine', 'My Requests'], ['team', 'Team Requests']].map(([key, label]) => (
              <div key={key} onClick={() => setTab(key)} style={{
                flex: 1, textAlign: 'center', padding: '8px 0', cursor: 'pointer',
                background: tab === key ? '#fff' : 'none',
                borderRadius: 9, fontSize: 13, fontWeight: tab === key ? 700 : 500,
                color: tab === key ? c.text : c.textMuted,
                boxShadow: tab === key ? c.sm : 'none',
                border: tab === key ? `1px solid ${c.border}` : 'none',
              }}>{label}</div>
            ))}
          </div>
          {activeItems === null ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
          ) : activeItems.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>You have no requests</div>
          ) : (
            <div style={{ marginTop: 8 }}>
              {activeItems.slice(0, 5).map(item => (
                <RequestRow key={`${item.kind}-${item.id}`} item={item} onClick={() => setSelected({ item, mode: tab })} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const sheets = (
    <>
      <CheckInSheet
        open={!!checkSheet} mode={checkSheet} openRecord={openRecord}
        onClose={() => setCheckSheet(null)}
        onDone={() => { loadOpenRecord(); loadMine() }}
      />
      <RequestDetailSheet
        item={selected?.item} mode={selected?.mode}
        onClose={() => setSelected(null)}
        onActioned={handleActioned}
      />
    </>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <AppTopBar user={user} onAvatarClick={() => navigate('/profile')} />
        {content}
        {sheets}
      </div>
    )
  }

  // Desktop — no mobile top bar, just content inside the AppLayout main area
  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Home</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>Welcome back, {user?.en_display_name || user?.display_name}</p>
      </div>
      {content}
      {sheets}
    </div>
  )
}
