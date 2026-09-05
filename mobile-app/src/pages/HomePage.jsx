import { useState, useEffect, useCallback, lazy } from 'react'
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
const DesktopDashboardPage = lazy(() => import('@/pages/desktop/DashboardPage')) // see App.jsx's top comment - split out of the initial bundle

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

// The mobile home screen - a to-do list (clock in/out + reminders + quick
// links). Desktop is a genuinely different page (pages/desktop/DashboardPage.jsx,
// a stats/chart/activity dashboard) picked below rather than a wide-screen
// variant of this one.
function MobileHomePage() {
  const { user, hasPermission, isModuleEnabled } = useAuth()
  const navigate = useNavigate()

  const [openRecord, setOpenRecord] = useState(undefined) // undefined = loading, null = none
  const [checkSheet, setCheckSheet] = useState(null) // 'in' | 'out' | null
  const [now, setNow] = useState(Date.now())

  const [unsubmitted, setUnsubmitted] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [teamAttendanceCount, setTeamAttendanceCount] = useState(0)
  const [teamLeaveCount, setTeamLeaveCount] = useState(0)
  const [finalApprovalCount, setFinalApprovalCount] = useState(0)
  const [deductionReviewCount, setDeductionReviewCount] = useState(0)

  const timesheetOn = isModuleEnabled('timesheet')
  const leavesOn = isModuleEnabled('leaves')
  const deductionsOn = isModuleEnabled('deductions')
  const expensesOn = isModuleEnabled('expense_claims')
  const canFinalApprove = timesheetOn && hasPermission('attendance.final_approve')
  const canReviewDeductions = deductionsOn && hasPermission('deductions.review')

  const loadOpenRecord = useCallback(async () => {
    if (!timesheetOn) { setOpenRecord(null); return }
    try {
      const { data } = await attendanceAPI.myOpenRecord()
      setOpenRecord(data.record)
    } catch {
      setOpenRecord(null)
    }
  }, [timesheetOn])

  const loadUnsubmitted = useCallback(async () => {
    if (!timesheetOn) { setUnsubmitted([]); return }
    try {
      const { data } = await attendanceAPI.myRecords()
      setUnsubmitted((data.records || []).filter(r => r.status === 'closed'))
    } catch {
      setUnsubmitted([])
    }
  }, [timesheetOn])

  const loadReminders = useCallback(async () => {
    if (timesheetOn) {
      try {
        const { data } = await attendanceAPI.teamSubmissions()
        setTeamAttendanceCount((data.submissions || []).length)
      } catch { setTeamAttendanceCount(0) }
    }
    if (leavesOn) {
      try {
        const { data } = await leaveAPI.teamRequests()
        setTeamLeaveCount((data.requests || []).length)
      } catch { setTeamLeaveCount(0) }
    }
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
  }, [timesheetOn, leavesOn, canFinalApprove, canReviewDeductions])

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
    leavesOn && { icon: 'calendar',    label: 'Request Leave',      onClick: () => navigate('/leave/new') },
    deductionsOn && { icon: 'alertCircle', label: 'Flag a Deduction',   onClick: () => navigate('/deductions/new') },
    deductionsOn && { icon: 'creditCard',  label: 'My Deductions',       onClick: () => navigate('/deductions/mine') },
    expensesOn && { icon: 'dollarSign',  label: 'Claim an Expense',   onClick: () => navigate('/expense-claims/new') },
    expensesOn && { icon: 'fileText',    label: 'My Expense Claims',  onClick: () => navigate('/expense-claims/mine') },
    { icon: 'idCard',      label: 'Employee Card',       onClick: () => navigate('/employee-card') },
    { icon: 'passport',    label: 'Documents',            onClick: () => navigate('/legal-documents') },
  ].filter(Boolean)

  const elapsed = openRecord ? formatElapsed(now - new Date(openRecord.clock_in).getTime()) : null
  const erpLinked = !!user?.erp_employee_id
  const checkInDisabled = openRecord === undefined || !erpLinked

  const hasReminders = unsubmitted.length > 0 || teamAttendanceCount > 0 || teamLeaveCount > 0
    || finalApprovalCount > 0 || deductionReviewCount > 0

  const content = (
    <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: '100%' }}>
      {/* Greeting card */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: `1px solid ${c.border}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 1 }}>
          Hey, {firstName} 👋
        </div>
        {user?.display_name && (
          <div style={{ fontSize: 13, color: c.textMuted, marginBottom: timesheetOn ? 14 : 0, direction: 'rtl', textAlign: 'left' }}>
            {user.display_name}
          </div>
        )}
        {timesheetOn && (
          <>
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
          </>
        )}
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

  return (
    <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
      <AppTopBar user={user} onAvatarClick={() => navigate('/profile')} />
      {content}
      <CheckInSheet
        open={!!checkSheet} mode={checkSheet} openRecord={openRecord}
        onClose={() => setCheckSheet(null)}
        onDone={() => { loadOpenRecord(); loadUnsubmitted() }}
      />
    </div>
  )
}

export default function HomePage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileHomePage /> : <DesktopDashboardPage />
}
