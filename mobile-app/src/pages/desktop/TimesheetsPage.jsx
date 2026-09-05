import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { attendanceAPI, leaveAPI, erpAPI } from '@/services/api'
import { PageHeader, Panel, PrimaryButton, SecondaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Badge from '@/desktop/components/Badge'
import Drawer from '@/desktop/components/Drawer'

const STATUS_TONE = { pending: 'orange', supervisor_approved: 'blue', approved: 'green', rejected: 'red' }
const STATUS_LABEL = { pending: 'Pending', supervisor_approved: 'Awaiting Final Approval', approved: 'Approved', rejected: 'Rejected' }

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// A real timesheet table - this is what "timesheets" meant to build,
// distinct from the mobile Attendance page's card list: sortable columns,
// a bulk-submit toolbar for unsubmitted records, and a side drawer for
// review instead of a bottom sheet.
function UnsubmittedPanel({ records, onSubmitted }) {
  const [selected, setSelected] = useState(new Set(records.map(r => r.id)))
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { setSelected(new Set(records.map(r => r.id))) }, [records])

  if (records.length === 0) return null

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const submit = async () => {
    if (selected.size === 0) return
    setSubmitting(true)
    try {
      await attendanceAPI.createSubmission([...selected])
      toast.success('Submitted for approval')
      onSubmitted()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit')
    } finally { setSubmitting(false) }
  }

  return (
    <Panel
      title={`Unsubmitted records (${records.length})`}
      className="mb-5"
      action={
        <PrimaryButton onClick={submit} disabled={submitting || selected.size === 0}>
          {submitting ? 'Submitting…' : `Submit ${selected.size || ''}`}
        </PrimaryButton>
      }
    >
      <div className="flex flex-col gap-2">
        {records.map(r => (
          <label key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
            <div className="flex-1 min-w-0 text-sm">
              <span className="font-medium text-slate-700">{r.project_name}</span>
              <span className="text-slate-400 ml-2">
                {r.clock_in ? fmtDate(r.clock_in) : ''} · {r.hours ?? '—'}h
                {r.overtime_hours_requested > 0 && ` · ${r.overtime_hours_requested}h OT`}
              </span>
            </div>
          </label>
        ))}
      </div>
    </Panel>
  )
}

function SubmissionDrawer({ submission, mode, onClose, onActioned }) {
  const [detail, setDetail] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDetail(null); setRejecting(false); setNote('')
    if (!submission) return
    attendanceAPI.getSubmission(submission.id).then(({ data }) => setDetail(data)).catch(() => {})
  }, [submission])

  if (!submission) return null
  const canAct = (mode === 'team' && submission.status === 'pending')
    || (mode === 'final' && submission.status === 'supervisor_approved')

  const approve = async () => {
    setBusy(true)
    try {
      if (mode === 'final') await attendanceAPI.finalApprove([submission.id])
      else await attendanceAPI.approveSubmission(submission.id, {})
      toast.success('Approved'); onActioned(); onClose()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to approve') } finally { setBusy(false) }
  }
  const reject = async () => {
    if (!note.trim()) return toast.error('A reason is required to reject.')
    setBusy(true)
    try {
      if (mode === 'final') await attendanceAPI.finalReject([submission.id], note)
      else await attendanceAPI.rejectSubmission(submission.id, note)
      toast.success('Rejected'); onActioned(); onClose()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to reject') } finally { setBusy(false) }
  }

  return (
    <Drawer open={!!submission} onClose={onClose} title={submission.display_name || 'Timesheet Submission'}
      sub={`${submission.project_ids?.length || 0} site(s) · ${fmtDate(submission.period_start)}`}>
      <div className="flex items-center justify-between mb-4">
        <Badge tone={STATUS_TONE[submission.status] || 'neutral'}>{STATUS_LABEL[submission.status] || submission.status}</Badge>
        <div className="text-sm font-semibold text-slate-700">
          {submission.total_hours || 0}h total
          {submission.total_overtime_hours > 0 && <span className="text-blue-600"> · {submission.total_overtime_hours}h OT</span>}
        </div>
      </div>

      {submission.push_status && submission.push_status !== 'pushed' && (
        <div className="flex gap-2 mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <Icon name="alertCircle" size={14} className="shrink-0 mt-0.5" />
          Approved, but didn't fully reach payroll ({submission.push_status}). May need manual correction in egc_hr.
        </div>
      )}

      <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Clock Records</div>
      {!detail ? (
        <div className="text-sm text-slate-400 py-4">Loading…</div>
      ) : !detail.records?.length ? (
        <div className="text-sm text-slate-400 py-4">No records.</div>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {detail.records.map(rec => (
            <div key={rec.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex justify-between text-sm font-semibold text-slate-700">
                <span>{rec.project_name}</span>
                <span>{rec.hours != null ? `${rec.hours}h` : '—'}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">{fmtDateTime(rec.clock_in)} → {fmtDateTime(rec.clock_out)}</div>
              {rec.overtime_hours_requested > 0 && (
                <div className="text-xs text-blue-600 font-semibold mt-1">Overtime: {rec.overtime_hours_requested}h</div>
              )}
              {rec.note && <div className="text-xs text-slate-500 italic mt-1">"{rec.note}"</div>}
            </div>
          ))}
        </div>
      )}

      {canAct && (
        rejecting ? (
          <div className="flex flex-col gap-2">
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Reason for rejecting (required)"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
            <div className="flex gap-2">
              <SecondaryButton onClick={() => setRejecting(false)}>Cancel</SecondaryButton>
              <SecondaryButton tone="danger" onClick={reject} disabled={busy}>{busy ? 'Rejecting…' : 'Confirm Reject'}</SecondaryButton>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <SecondaryButton tone="danger" onClick={() => setRejecting(true)} disabled={busy} icon={<Icon name="xCircle" size={14} />}>Reject</SecondaryButton>
            <PrimaryButton onClick={approve} disabled={busy} icon={<Icon name="checkCircle" size={14} />}>{busy ? 'Approving…' : 'Approve'}</PrimaryButton>
          </div>
        )
      )}
    </Drawer>
  )
}

export default function TimesheetsPage() {
  const { hasPermission } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const canFinalApprove = hasPermission('attendance.final_approve')

  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState(initialTab === 'team' || initialTab === 'final' ? initialTab : 'mine')
  const [records, setRecords] = useState([])
  const [unsubmitted, setUnsubmitted] = useState([])
  const [approvedLeaves, setApprovedLeaves] = useState([])
  const [mine, setMine] = useState(null)
  const [team, setTeam] = useState(null)
  const [final, setFinal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [bulkIds, setBulkIds] = useState(new Set())
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [siteNames, setSiteNames] = useState({})

  useEffect(() => {
    erpAPI.projectSites().then(({ data }) => {
      setSiteNames(Object.fromEntries((data.sites || []).map(s => [s.name, s.project_name])))
    }).catch(() => {})
  }, [])

  const loadMine = useCallback(async () => {
    try {
      const { data } = await attendanceAPI.myRecords()
      setRecords(data.records || [])
      setUnsubmitted((data.records || []).filter(r => r.status === 'closed'))
      setMine(data.submissions || [])
    } catch { setMine([]) }
  }, [])
  const loadTeam = useCallback(async () => {
    try { const { data } = await attendanceAPI.teamSubmissions(); setTeam(data.submissions || []) } catch { setTeam([]) }
  }, [])
  const loadFinal = useCallback(async () => {
    if (!canFinalApprove) return
    try {
      const { data } = await attendanceAPI.pendingFinalApproval()
      setFinal(data.submissions || [])
      setBulkIds(prev => new Set([...prev].filter(id => (data.submissions || []).some(s => s.id === id))))
    } catch { setFinal([]) }
  }, [canFinalApprove])
  const loadLeaves = useCallback(async () => {
    try { const { data } = await leaveAPI.myRequests(); setApprovedLeaves((data.requests || []).filter(r => r.status === 'Approved')) } catch { setApprovedLeaves([]) }
  }, [])

  useEffect(() => { loadMine(); loadTeam(); loadFinal(); loadLeaves() }, [loadMine, loadTeam, loadFinal, loadLeaves])

  const handleTabChange = (key) => { setTab(key); setBulkIds(new Set()); setRejecting(false); setSearchParams(key === 'mine' ? {} : { tab: key }) }
  const handleActioned = () => { loadMine(); loadTeam(); loadFinal() }

  const toggleBulk = (id) => setBulkIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleBulkAll = () => {
    const list = tab === 'final' ? final : team
    if (!list) return
    setBulkIds(prev => prev.size === list.length ? new Set() : new Set(list.map(s => s.id)))
  }
  const approveBulk = async () => {
    if (bulkIds.size === 0) return
    setBulkBusy(true)
    try {
      if (tab === 'final') {
        const { data } = await attendanceAPI.finalApprove([...bulkIds])
        const failed = data.results.filter(r => !r.ok)
        const pushFailed = data.results.filter(r => r.ok && r.push_status !== 'pushed')
        if (failed.length === 0 && pushFailed.length === 0) toast.success(`${data.results.length} submission(s) approved and pushed`)
        else toast.error(`${data.results.length - failed.length - pushFailed.length} pushed cleanly, ${pushFailed.length} had a push issue, ${failed.length} failed`)
      } else {
        const ids = [...bulkIds]
        const results = await Promise.allSettled(ids.map(id => attendanceAPI.approveSubmission(id, {})))
        const failed = results.filter(r => r.status === 'rejected').length
        if (failed === 0) toast.success(`${ids.length} submission(s) approved`)
        else toast.error(`${ids.length - failed} approved, ${failed} failed`)
      }
      setBulkIds(new Set()); loadFinal(); loadTeam()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to approve') } finally { setBulkBusy(false) }
  }
  const rejectBulk = async () => {
    if (!rejectNote.trim()) return toast.error('A reason is required to reject.')
    setBulkBusy(true)
    try {
      if (tab === 'final') {
        await attendanceAPI.finalReject([...bulkIds], rejectNote)
        toast.success(`${bulkIds.size} submission(s) sent back`)
      } else {
        const ids = [...bulkIds]
        const results = await Promise.allSettled(ids.map(id => attendanceAPI.rejectSubmission(id, rejectNote)))
        const failed = results.filter(r => r.status === 'rejected').length
        if (failed === 0) toast.success(`${ids.length} submission(s) sent back`)
        else toast.error(`${ids.length - failed} sent back, ${failed} failed`)
      }
      setBulkIds(new Set()); setRejecting(false); setRejectNote(''); loadFinal(); loadTeam()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to reject') } finally { setBulkBusy(false) }
  }

  const siteLabel = (ids) => (ids || []).map(id => siteNames[id] || id).join(', ') || '—'

  const columns = (mode) => [
    ...(mode !== 'mine' ? [{ key: 'display_name', label: 'Employee', sortable: true }] : []),
    {
      key: 'project_ids', label: 'Sites', sortValue: r => siteLabel(r.project_ids),
      render: r => {
        const names = (r.project_ids || []).map(id => siteNames[id] || id)
        return (
          <span title={names.join(', ')}>
            {names.length === 0 ? '—' : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`}
          </span>
        )
      },
    },
    { key: 'record_ids', label: 'Entries', align: 'right', sortValue: r => r.record_ids?.length || 0, render: r => r.record_ids?.length || 0 },
    { key: 'period_start', label: 'Period', sortable: true, render: r => `${fmtDate(r.period_start)} → ${fmtDate(r.period_end)}` },
    { key: 'total_hours', label: 'Hours', sortable: true, align: 'right', render: r => `${r.total_hours || 0}h` },
    {
      key: 'total_overtime_hours', label: 'Overtime', align: 'right', sortable: true,
      render: r => r.total_overtime_hours > 0 ? <span className="text-blue-600 font-medium">{r.total_overtime_hours}h</span> : <span className="text-slate-300">—</span>,
    },
    { key: 'status', label: 'Status', sortable: true, render: r => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{STATUS_LABEL[r.status] || r.status}</Badge> },
    ...(mode === 'final' ? [
      { key: 'reviewed_by_name', label: 'Reviewed By', sortable: true, render: r => r.reviewed_by_name || '—' },
      { key: 'reviewed_at', label: 'Reviewed', sortable: true, render: r => fmtDate(r.reviewed_at) },
    ] : []),
    { key: 'submitted_at', label: 'Submitted', sortable: true, render: r => fmtDate(r.submitted_at) },
  ]

  const tabs = [
    { key: 'mine', label: 'My Timesheets', rows: mine },
    { key: 'team', label: 'Team', rows: team },
    ...(canFinalApprove ? [{ key: 'final', label: 'Final Approval', rows: final }] : []),
  ]
  const active = tabs.find(t => t.key === tab) || tabs[0]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Timesheets"
        sub="Clock records, submissions, and approvals across the workforce."
      />

      {tab === 'mine' && <UnsubmittedPanel records={unsubmitted} onSubmitted={loadMine} />}

      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t.label}{t.rows?.length ? ` (${t.rows.length})` : ''}
          </button>
        ))}
      </div>

      {(tab === 'final' || tab === 'team') && rejecting && (
        <div className="mb-4 p-4 rounded-lg border border-slate-200 bg-white">
          <div className="text-sm font-semibold text-slate-700 mb-2">Reject {bulkIds.size} submission(s)</div>
          <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2} placeholder="Reason for rejecting (required)"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
          <div className="flex gap-2 mt-2">
            <SecondaryButton onClick={() => { setRejecting(false); setRejectNote('') }}>Cancel</SecondaryButton>
            <SecondaryButton tone="danger" onClick={rejectBulk} disabled={bulkBusy}>{bulkBusy ? 'Rejecting…' : 'Confirm Reject'}</SecondaryButton>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns(tab)}
          rows={active.rows || []}
          loading={active.rows === null}
          searchKeys={tab === 'mine' ? ['period_start'] : ['display_name']}
          searchPlaceholder={tab === 'mine' ? 'Search by date…' : 'Search by employee…'}
          onRowClick={row => setSelected({ item: row, mode: tab })}
          selection={(tab === 'final' || tab === 'team') ? { selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll } : undefined}
          bulkActions={(tab === 'final' || tab === 'team') ? [
            { key: 'approve', label: 'Approve', icon: <Icon name="checkCircle" size={14} />, onClick: approveBulk },
            { key: 'reject', label: 'Reject', tone: 'danger', icon: <Icon name="xCircle" size={14} />, onClick: () => setRejecting(true) },
          ] : undefined}
          emptyTitle={tab === 'mine' ? 'No submissions yet' : 'Nothing here'}
          emptyBody={tab === 'mine' ? 'Submit unsubmitted records above to see them here.' : tab === 'final' ? 'Nothing is currently awaiting final approval.' : 'Nothing is currently awaiting review.'}
        />
      </div>
      {(tab === 'final' || tab === 'team') && (
        <p className="text-xs text-slate-400 mt-2">Click a row to review its clock records before approving. Check its box to include it in a bulk action.</p>
      )}

      <SubmissionDrawer submission={selected?.item} mode={selected?.mode} onClose={() => setSelected(null)} onActioned={handleActioned} />
    </div>
  )
}
