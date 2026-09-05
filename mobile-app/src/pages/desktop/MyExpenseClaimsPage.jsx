import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { expenseClaimsAPI } from '@/services/api'
import { statusBadge, fmtClaimDate } from '@/utils/expenseClaims'
import { PageHeader, PrimaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Badge from '@/desktop/components/Badge'
import { Icon } from '@/components/Icons'


const WITHDRAWABLE = new Set(['submitted', 'processing'])

export default function MyExpenseClaimsPage() {
  const navigate = useNavigate()
  const [applications, setApplications] = useState(null)
  const [bulkIds, setBulkIds] = useState(new Set())
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await expenseClaimsAPI.mine()
      setApplications(data.applications)
      setBulkIds(prev => new Set([...prev].filter(id => data.applications.some(a => a.id === id))))
    }
    catch { toast.error('Failed to load your expense claims'); setApplications([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const withdrawable = (applications || []).filter(a => WITHDRAWABLE.has(a.status))
  const toggleBulk = (id) => setBulkIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleBulkAll = () => setBulkIds(prev => prev.size === withdrawable.length ? new Set() : new Set(withdrawable.map(a => a.id)))
  const withdrawBulk = async () => {
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => expenseClaimsAPI.withdraw(id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`${ids.length} claim(s) withdrawn`)
      else toast.error(`${ids.length - failed} withdrawn, ${failed} failed`)
      setBulkIds(new Set()); setConfirmingWithdraw(false); load()
    } finally { setBulkBusy(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="My Expense Claims"
        sub="Track your submitted expense claims through review and approval."
        action={<PrimaryButton onClick={() => navigate('/expense-claims/new')} icon={<Icon name="plus" size={14} />}>Claim an Expense</PrimaryButton>}
      />

      {confirmingWithdraw && (
        <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 flex items-center gap-3">
          <Icon name="alertCircle" size={16} className="text-red-500 shrink-0" />
          <div className="text-sm font-semibold text-red-700 flex-1">Withdraw {bulkIds.size} claim(s)? This can't be undone.</div>
          <SecondaryButton onClick={() => setConfirmingWithdraw(false)}>Cancel</SecondaryButton>
          <SecondaryButton tone="danger" onClick={withdrawBulk} disabled={bulkBusy}>{bulkBusy ? 'Withdrawing…' : 'Confirm Withdraw'}</SecondaryButton>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <DataTable
          columns={[
            { key: 'project_name', label: 'Project', sortable: true, render: r => r.project_name || r.project_id },
            { key: 'purpose', label: 'Purpose', render: r => <span className="truncate block max-w-xs">{r.purpose || '—'}</span> },
            { key: 'total_claimed_amount', label: 'Amount', align: 'right', sortable: true, render: r => r.total_claimed_amount ? `SAR ${r.total_claimed_amount}` : '—' },
            { key: 'status', label: 'Status', sortable: true, render: r => <Badge tone={statusBadge(r.status).tone}>{statusBadge(r.status).label}</Badge> },
            { key: 'submitted_at', label: 'Submitted', sortable: true, render: r => fmtClaimDate(r.submitted_at) },
          ]}
          rows={applications || []}
          loading={applications === null}
          searchKeys={['project_name', 'purpose']}
          onRowClick={row => navigate(`/expense-claims/${row.id}`)}
          selection={withdrawable.length > 0 ? { selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll } : undefined}
          bulkActions={[
            { key: 'withdraw', label: 'Withdraw', tone: 'danger', icon: <Icon name="xCircle" size={14} />, onClick: () => setConfirmingWithdraw(true) },
          ]}
          emptyTitle="No expense claims yet"
        />
      </div>
    </div>
  )
}
