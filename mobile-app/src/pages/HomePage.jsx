import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import MenuList from '@/components/ui/MenuList'
import { AppTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { attendanceAPI, leaveAPI, deductionsAPI } from '@/services/api'
import CheckInSheet from '@/components/attendance/CheckInSheet'

function formatElapsed(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
}

// A reminder only exists while it's true - once the underlying count hits
// zero it just isn't rendered. Home is meant to be a to-do list, not a
// dashboard of everything that ever happened - the full history lives on
// the Attendance/Leaves pages this links out to.
function ReminderCard({ icon, title, subtitle, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px',
      background: c.blueBg, border: `1px solid ${c.blueBorder}`, borderRadius: 14,
      cursor: 'pointer', textAlign: 'left', fontFamily: c.font,
    }}>
      <Icon name={icon} size={18} color={c.blue} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{title}</div>
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 1 }}>{subtitle}</div>
      </div>
      <Icon name="chevronRight" size={14} color={c.textMuted} />
    </button>
  )
}

export default function HomePage() {
  const { user, hasPermission } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [openRecord, setOpenRecord] = useState(undefined) // undefined = loading, null = none
  const [checkSheet, setCheckSheet] = useState(null) // 'in' | 'out' | null
  const [now, setNow] = useState(Date.now())

  const [unsubmitted, setUnsubmitted] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [teamAttendanceCount, setTeamAttendanceCount] = useState(0)
  const [teamLeaveCount, setTeamLeaveCount] = useState(0)
  const [finalApprovalCount, setFinalApprovalCount] = useState(0)
  const [deductionReviewCount, setDeductionReviewCount] = useState(0)

  const canFinalApprove = hasPermission('attendance.final_approve')
  const canReviewDeductions = hasPermission('deductions.review')

  const loadOpenRecord = useCallback(async () => {
    try {
      const { data } = await attendanceAPI.myOpenRecord()
      setOpenRecord(data.record)
    } catch {
      setOpenRecord(null)
    }
  }, [])

  const loadUnsubmitted = useCallback(async () => {
    try {
      const { data } = await attendanceAPI.myRecords()
      setUnsubmitted((data.records || []).filter(r => r.status === 'closed'))
    } catch {
      setUnsubmitted([])
    }
  }, [])

  const loadReminders = useCallback(async () => {
    try {
      const { data } = await attendanceAPI.teamSubmissions()
      setTeamAttendanceCount((data.submissions || []).length)
    } catch { setTeamAttendanceCount(0) }
    try {
      const { data } = await leaveAPI.teamRequests()
      setTeamLeaveCount((data.requests || []).length)
    } catch { setTeamLeaveCount(0) }
    if (canFinalApprove) {
      try {
        const { data } = await attendanceAPI.pendingFinalApproval()
        setFinalApprovalCount((data.submissions || []).length)
      } catch { setFinalApprovalCount(0) }
    }
    if (canReviewDeductions) {
      try {
        const [{ data: reqData }, { data: appealData }] = await Promise.all([
          deductionsAPI.pendingRequests(), deductionsAPI.pendingAppeals(),
        ])
        setDeductionReviewCount((reqData.requests || []).length + (appealData.deductions || []).length)
      } catch { setDeductionReviewCount(0) }
    }
  }, [canFinalApprove, canReviewDeductions])

  useEffect(() => { loadOpenRecord(); loadUnsubmitted(); loadReminders() }, [loadOpenRecord, loadUnsubmitted, loadReminders])

  useEffect(() => {
    if (!openRecord) return
    const interval = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(interval)
  }, [openRecord])

  const handleSubmitAll = async () => {
    setSubmitting(true)
    try {
      await attendanceAPI.createSubmission(unsubmitted.map(r => r.id))
      toast.success('Submitted for approval')
      loadUnsubmitted()
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
    { icon: 'calendar',    label: 'Request Leave',      onClick: () => navigate('/leave/new') },
    { icon: 'alertCircle', label: 'Flag a Deduction',   onClick: () => navigate('/deductions/new') },
    { icon: 'creditCard',  label: 'My Deductions',       onClick: () => navigate('/deductions/mine') },
    { icon: 'idCard',      label: 'Employee Card',       onClick: () => navigate('/employee-card') },
    { icon: 'passport',    label: 'Documents',            onClick: () => navigate('/legal-documents') },
    { icon: 'dollarSign',  label: 'Claim an Expense',   onClick: () => {} },
    { icon: 'fileText',    label: 'View Salary Slips',  onClick: () => {} },
  ]

  const elapsed = openRecord ? formatElapsed(now - new Date(openRecord.clock_in).getTime()) : null
  const erpLinked = !!user?.erp_employee_id
  const checkInDisabled = openRecord === undefined || !erpLinked

  const hasReminders = unsubmitted.length > 0 || teamAttendanceCount > 0 || teamLeaveCount > 0
    || finalApprovalCount > 0 || deductionReviewCount > 0

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

      {/* Action reminders - each one only exists while it's actually true */}
      {hasReminders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {unsubmitted.length > 0 && (
            <div style={{ background: c.blueBg, borderRadius: 14, padding: '13px 16px', border: `1px solid ${c.blueBorder}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Icon name="clock" size={18} color={c.blue} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
                  {unsubmitted.length} record{unsubmitted.length !== 1 ? 's' : ''} ready to submit
                </div>
                <div style={{ fontSize: 11, color: c.textSub, marginTop: 1 }}>
                  {unsubmitted.reduce((sum, r) => sum + (r.hours || 0), 0).toFixed(2)}h total · <button onClick={() => navigate('/attendance')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.blue, fontWeight: 600, fontFamily: c.font, fontSize: 11, textDecoration: 'underline' }}>review individually</button>
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

          {teamAttendanceCount > 0 && (
            <ReminderCard
              icon="clock"
              title={`${teamAttendanceCount} attendance submission${teamAttendanceCount !== 1 ? 's' : ''} awaiting your review`}
              subtitle="Tap to review"
              onClick={() => navigate('/attendance?tab=team')}
            />
          )}

          {teamLeaveCount > 0 && (
            <ReminderCard
              icon="calendar"
              title={`${teamLeaveCount} leave request${teamLeaveCount !== 1 ? 's' : ''} awaiting your review`}
              subtitle="Tap to review"
              onClick={() => navigate('/leaves?tab=team')}
            />
          )}

          {finalApprovalCount > 0 && (
            <ReminderCard
              icon="checkCircle"
              title={`${finalApprovalCount} submission${finalApprovalCount !== 1 ? 's' : ''} awaiting final approval`}
              subtitle="Tap to review"
              onClick={() => navigate('/attendance/final-approval')}
            />
          )}

          {deductionReviewCount > 0 && (
            <ReminderCard
              icon="alertCircle"
              title={`${deductionReviewCount} deduction item${deductionReviewCount !== 1 ? 's' : ''} awaiting your review`}
              subtitle="Requests and appeals"
              onClick={() => navigate('/deductions/review')}
            />
          )}
        </div>
      )}

      {/* Quick Links */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: c.text, marginBottom: 12, paddingLeft: 4 }}>Quick Links</div>
        <MenuList items={quickLinks} />
      </div>
    </div>
  )

  const sheets = (
    <CheckInSheet
      open={!!checkSheet} mode={checkSheet} openRecord={openRecord}
      onClose={() => setCheckSheet(null)}
      onDone={() => { loadOpenRecord(); loadUnsubmitted() }}
    />
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
