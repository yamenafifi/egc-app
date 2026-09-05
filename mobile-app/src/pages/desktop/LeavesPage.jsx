import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { leaveAPI } from '@/services/api'
import { PageHeader, PrimaryButton, SecondaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Badge from '@/desktop/components/Badge'
import Drawer from '@/desktop/components/Drawer'

const STATUS_TONE = { Open: 'orange', Approved: 'green', Rejected: 'red' }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function LeaveDrawer({ leave, mode, onClose, onActioned }) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setRejecting(false); setNote('') }, [leave])
  if (!leave) return null

  const canAct = mode === 'team' && leave.status === 'Open'

  const approve = async () => {
    setBusy(true)
    try { await leaveAPI.approve(leave.id); toast.success('Approved'); onActioned(); onClose() }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to approve') } finally { setBusy(false) }
  }
  const reject = async () => {
    setBusy(true)
    try { await leaveAPI.reject(leave.id, note || undefined); toast.success('Rejected'); onActioned(); onClose() }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to reject') } finally { setBusy(false) }
  }

  return (
    <Drawer open={!!leave} onClose={onClose} title={leave.leave_type || 'Leave Request'} sub={leave.display_name}>
      <div className="flex items-center justify-between mb-4">
        <Badge tone={STATUS_TONE[leave.status] || 'neutral'}>{leave.status}</Badge>
        <div className="text-sm text-slate-500">{fmtDate(leave.from_date)} → {fmtDate(leave.to_date)}</div>
      </div>
      <div className="space-y-4 text-sm">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Reason</div>
          <div className="text-slate-700">{leave.reason || '—'}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Approver</div>
          <div className="text-slate-700">{leave.leave_approver_name || '—'}</div>
        </div>
        {leave.action_remarks && (
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Remarks</div>
            <div className="text-slate-700">{leave.action_remarks}</div>
          </div>
        )}
      </div>

      {canAct && (
        <div className="mt-6">
          {rejecting ? (
            <div className="flex flex-col gap-2">
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Reason for rejecting (optional)"
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
          )}
        </div>
      )}
    </Drawer>
  )
}

export default function LeavesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') === 'team' ? 'team' : 'mine')
  const [mine, setMine] = useState(null)
  const [team, setTeam] = useState(null)
  const [selected, setSelected] = useState(null)
  const [autoOpenChecked, setAutoOpenChecked] = useState(false)
  const [bulkIds, setBulkIds] = useState(new Set())
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  const loadMine = useCallback(async () => {
    try { const { data } = await leaveAPI.myRequests(); setMine(data.requests || []) } catch { setMine([]) }
  }, [])
  const loadTeam = useCallback(async () => {
    try {
      const { data } = await leaveAPI.teamRequests()
      setTeam(data.requests || [])
      setBulkIds(prev => new Set([...prev].filter(id => (data.requests || []).some(r => r.id === id))))
    } catch { setTeam([]) }
  }, [])

  useEffect(() => { loadMine(); loadTeam() }, [loadMine, loadTeam])

  useEffect(() => {
    if (autoOpenChecked) return
    const list = tab === 'mine' ? mine : team
    if (list === null) return
    const leaveId = searchParams.get('leave')
    if (leaveId) {
      const found = list.find(i => i.id === leaveId)
      if (found) setSelected({ item: found, mode: tab })
    }
    setAutoOpenChecked(true)
  }, [mine, team, tab, searchParams, autoOpenChecked])

  const handleTabChange = (key) => { setTab(key); setBulkIds(new Set()); setRejecting(false); setSearchParams(key === 'mine' ? {} : { tab: key }) }
  const handleActioned = () => { loadMine(); loadTeam() }
  const rows = tab === 'mine' ? mine : team

  const toggleBulk = (id) => setBulkIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleBulkAll = () => {
    if (!team) return
    setBulkIds(prev => prev.size === team.length ? new Set() : new Set(team.map(r => r.id)))
  }
  const approveBulk = async () => {
    if (bulkIds.size === 0) return
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => leaveAPI.approve(id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`${ids.length} request(s) approved`)
      else toast.error(`${ids.length - failed} approved, ${failed} failed`)
      setBulkIds(new Set()); loadTeam()
    } finally { setBulkBusy(false) }
  }
  const rejectBulk = async () => {
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => leaveAPI.reject(id, rejectNote || undefined)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`${ids.length} request(s) rejected`)
      else toast.error(`${ids.length - failed} rejected, ${failed} failed`)
      setBulkIds(new Set()); setRejecting(false); setRejectNote(''); loadTeam()
    } finally { setBulkBusy(false) }
  }

  const columns = [
    ...(tab === 'team' ? [{ key: 'display_name', label: 'Employee', sortable: true }] : []),
    { key: 'leave_type', label: 'Type', sortable: true },
    { key: 'from_date', label: 'From', sortable: true, render: r => fmtDate(r.from_date) },
    { key: 'to_date', label: 'To', sortable: true, render: r => fmtDate(r.to_date) },
    { key: 'status', label: 'Status', sortable: true, render: r => <Badge tone={STATUS_TONE[r.status] || 'neutral'}>{r.status}</Badge> },
    { key: 'submitted_at', label: 'Submitted', sortable: true, render: r => fmtDate(r.submitted_at) },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Leaves"
        sub="Leave requests across the workforce, and anything awaiting your review."
        action={<PrimaryButton onClick={() => navigate('/leave/new')} icon={<Icon name="plus" size={14} />}>Request a Leave</PrimaryButton>}
      />

      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {[['mine', 'My Leaves', mine], ['team', 'Team Leaves', team]].map(([key, label, list]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {label}{list?.length ? ` (${list.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'team' && rejecting && (
        <div className="mb-4 p-4 rounded-lg border border-slate-200 bg-white">
          <div className="text-sm font-semibold text-slate-700 mb-2">Reject {bulkIds.size} request(s)</div>
          <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={2} placeholder="Reason for rejecting (optional)"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
          <div className="flex gap-2 mt-2">
            <SecondaryButton onClick={() => { setRejecting(false); setRejectNote('') }}>Cancel</SecondaryButton>
            <SecondaryButton tone="danger" onClick={rejectBulk} disabled={bulkBusy}>{bulkBusy ? 'Rejecting…' : 'Confirm Reject'}</SecondaryButton>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          rows={rows || []}
          loading={rows === null}
          searchKeys={tab === 'team' ? ['display_name', 'leave_type'] : ['leave_type']}
          onRowClick={row => setSelected({ item: row, mode: tab })}
          selection={tab === 'team' ? { selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll } : undefined}
          bulkActions={tab === 'team' ? [
            { key: 'approve', label: 'Approve', icon: <Icon name="checkCircle" size={14} />, onClick: approveBulk },
            { key: 'reject', label: 'Reject', tone: 'danger', icon: <Icon name="xCircle" size={14} />, onClick: () => setRejecting(true) },
          ] : undefined}
          emptyTitle={tab === 'mine' ? 'No leave requests yet' : 'Nothing to review'}
        />
      </div>

      <LeaveDrawer leave={selected?.item} mode={selected?.mode} onClose={() => setSelected(null)} onActioned={handleActioned} />
    </div>
  )
}
