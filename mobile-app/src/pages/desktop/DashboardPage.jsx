import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { attendanceAPI, leaveAPI, deductionsAPI, expenseClaimsAPI } from '@/services/api'
import { PageHeader, Panel } from '@/desktop/components/Page'
import StatCard from '@/desktop/components/StatCard'
import Badge from '@/desktop/components/Badge'

const CHART_COLORS = ['#0f172a', '#2563eb', '#d97706', '#7c3aed']

function timeAgo(iso) {
  if (!iso) return ''
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)}h ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function DashboardPage() {
  const { user, hasPermission, isModuleEnabled } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    myOpenAttendance: 0, teamAttendance: [], teamLeaves: [], finalApproval: 0,
    deductionRequests: 0, deductionAppeals: 0, expenseReview: [], expenseFinal: [],
  })

  const timesheetOn = isModuleEnabled('timesheet')
  const leavesOn = isModuleEnabled('leaves')
  const deductionsOn = isModuleEnabled('deductions')
  const expensesOn = isModuleEnabled('expense_claims')

  const canFinalApprove = timesheetOn && hasPermission('attendance.final_approve')
  const canReviewDeductions = deductionsOn && hasPermission('deductions.review')
  const canReviewExpenses = expensesOn && hasPermission('expense_claims.review')
  const canFinalApproveExpenses = expensesOn && hasPermission('expense_claims.final_approve')

  const load = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      timesheetOn ? attendanceAPI.myRecords() : Promise.resolve({ data: { records: [] } }),
      timesheetOn ? attendanceAPI.teamSubmissions() : Promise.resolve({ data: { submissions: [] } }),
      leavesOn ? leaveAPI.teamRequests() : Promise.resolve({ data: { requests: [] } }),
      canFinalApprove ? attendanceAPI.pendingFinalApproval() : Promise.resolve({ data: { submissions: [] } }),
      canReviewDeductions ? deductionsAPI.pendingRequests() : Promise.resolve({ data: { requests: [] } }),
      canReviewDeductions ? deductionsAPI.pendingAppeals() : Promise.resolve({ data: { deductions: [] } }),
      canReviewExpenses ? expenseClaimsAPI.pendingReview() : Promise.resolve({ data: { applications: [] } }),
      canFinalApproveExpenses ? expenseClaimsAPI.pendingFinalApproval() : Promise.resolve({ data: { applications: [] } }),
    ])
    const val = (i, fallback) => results[i].status === 'fulfilled' ? results[i].value.data : fallback

    setStats({
      myOpenAttendance: (val(0, { records: [] }).records || []).filter(r => r.status === 'closed').length,
      teamAttendance: val(1, { submissions: [] }).submissions || [],
      teamLeaves: val(2, { requests: [] }).requests || [],
      finalApproval: (val(3, { submissions: [] }).submissions || []).length,
      deductionRequests: (val(4, { requests: [] }).requests || []).length,
      deductionAppeals: (val(5, { deductions: [] }).deductions || []).length,
      expenseReview: val(6, { applications: [] }).applications || [],
      expenseFinal: val(7, { applications: [] }).applications || [],
    })
    setLoading(false)
  }, [timesheetOn, leavesOn, canFinalApprove, canReviewDeductions, canReviewExpenses, canFinalApproveExpenses])

  useEffect(() => { load() }, [load])

  const chartData = [
    timesheetOn && { name: 'Timesheets', value: stats.teamAttendance.length + stats.finalApproval },
    leavesOn && { name: 'Leaves', value: stats.teamLeaves.length },
    deductionsOn && { name: 'Deductions', value: stats.deductionRequests + stats.deductionAppeals },
    expensesOn && { name: 'Expenses', value: stats.expenseReview.length + stats.expenseFinal.length },
  ].filter(Boolean)

  const activity = [
    ...stats.teamAttendance.map(s => ({ kind: 'Timesheet', label: `${s.project_ids?.length || 0} site(s) · ${s.total_hours || 0}h`, at: s.submitted_at, to: '/attendance?tab=team' })),
    ...stats.teamLeaves.map(l => ({ kind: 'Leave', label: `${l.leave_type || 'Leave'} request`, at: l.submitted_at, to: '/leaves?tab=team' })),
    ...stats.expenseReview.map(e => ({ kind: 'Expense Claim', label: `${e.employee_display_name} · SAR ${e.total_claimed_amount || 0}`, at: e.submitted_at, to: '/expense-claims/review?application=' + e.id })),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 8)

  const totalPending = chartData.reduce((s, d) => s + d.value, 0)

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.en_display_name || user?.display_name || ''}`}
        sub="Here's what needs attention across the workforce today."
      />

      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: `repeat(${[timesheetOn, leavesOn, deductionsOn, expensesOn].filter(Boolean).length || 1}, minmax(0, 1fr))` }}>
        {timesheetOn && <StatCard icon="clock" tone="blue" label="My unsubmitted records" value={loading ? '—' : stats.myOpenAttendance} onClick={() => navigate('/attendance')} />}
        {leavesOn && <StatCard icon="calendar" tone="orange" label="Leave requests to review" value={loading ? '—' : stats.teamLeaves.length} onClick={() => navigate('/leaves?tab=team')} />}
        {deductionsOn && <StatCard icon="alertCircle" tone="red" label="Deduction items pending" value={loading ? '—' : stats.deductionRequests + stats.deductionAppeals} onClick={() => navigate('/deductions/review')} />}
        {expensesOn && <StatCard icon="creditCard" tone="green" label="Expense claims in flight" value={loading ? '—' : stats.expenseReview.length + stats.expenseFinal.length} onClick={() => navigate('/expense-claims/review')} />}
      </div>

      <div className="grid grid-cols-3 gap-5">
        <Panel title="Pending work by area" className="col-span-2">
          {totalPending === 0 && !loading ? (
            <div className="h-56 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Icon name="checkCircle" size={28} className="text-emerald-400" />
              <div className="text-sm font-medium">All caught up - nothing pending review.</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={224}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Recent activity">
          {activity.length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">Nothing recent</div>
          ) : (
            <div className="flex flex-col -mx-1">
              {activity.map((a, i) => (
                <button
                  key={i}
                  onClick={() => navigate(a.to)}
                  className="flex items-start gap-3 px-1 py-2.5 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral">{a.kind}</Badge>
                      <span className="text-xs text-slate-400">{timeAgo(a.at)}</span>
                    </div>
                    <div className="text-sm text-slate-700 mt-1 truncate">{a.label}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
