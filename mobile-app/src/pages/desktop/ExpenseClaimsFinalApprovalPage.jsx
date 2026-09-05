import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { expenseClaimsAPI } from '@/services/api'
import { fmtClaimDate } from '@/utils/expenseClaims'
import { PageHeader, PrimaryButton, SecondaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Drawer from '@/desktop/components/Drawer'

// Read-only - by the time a claim reaches final approval the Accountant
// has already locked in the extracted fields (see
// pages/desktop/ExpenseClaimsReviewPage.jsx for the editable version).
// This is purely "see what you're approving before you approve it".
function ClaimPreviewDrawer({ application, onClose, onApprove, onReject, busy }) {
  const [sourcePdfUrl, setSourcePdfUrl] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  useEffect(() => {
    setSourcePdfUrl(null); setRejecting(false); setReason('')
    if (!application) return
    expenseClaimsAPI.sourcePdf(application.id).then(({ data }) => setSourcePdfUrl(URL.createObjectURL(data))).catch(() => toast.error('Failed to load the source PDF'))
  }, [application?.id])

  if (!application) return null
  const included = (application.receipts || []).filter(r => r.included)

  return (
    <Drawer open={!!application} onClose={onClose} width="min(1400px, 92vw)"
      title={application.employee_display_name}
      sub={`${application.project_name || application.project_id} · SAR ${application.total_claimed_amount} · reviewed by ${application.accountant_reviewed_by_name || '—'}`}>
      <div className="flex gap-5 h-full min-h-[640px]">
        <div className="flex-[3] min-w-0 bg-slate-100 rounded-lg overflow-hidden">
          {sourcePdfUrl
            ? <iframe src={sourcePdfUrl} title="Receipts PDF" className="w-full h-full border-0" />
            : <div className="flex items-center justify-center h-full text-sm text-slate-400">Loading PDF…</div>}
        </div>

        <div className="flex-[2] min-w-[340px] overflow-y-auto desktop-scrollbar pr-1">
          {application.created_by_display_name && (
            <div className="text-xs text-slate-400 mb-2">Submitted by {application.created_by_display_name} on the employee's behalf</div>
          )}
          {application.purpose && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 mb-3">{application.purpose}</div>}

          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2.5">
            {included.length} Receipt{included.length !== 1 ? 's' : ''}
          </div>
          <div className="flex flex-col gap-2.5 mb-5">
            {included.map((r, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex justify-between text-sm font-semibold text-slate-800">
                  <span>{r.vendor_name || 'Unknown vendor'}</span>
                  <span>{r.total_amount != null ? `SAR ${r.total_amount}` : '—'}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {r.receipt_date ? fmtClaimDate(r.receipt_date) : 'Date unknown'}
                  {r.vat_number ? ` · VAT ${r.vat_number}` : ''}
                </div>
                {r.description_en && <div className="text-xs text-slate-500 mt-1.5">{r.description_en}</div>}
              </div>
            ))}
          </div>

          {rejecting ? (
            <div className="flex flex-col gap-2">
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason for rejecting (required)"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
              <div className="flex gap-2">
                <SecondaryButton onClick={() => setRejecting(false)}>Cancel</SecondaryButton>
                <SecondaryButton tone="danger" disabled={busy} onClick={() => onReject(application.id, reason)}>{busy ? 'Rejecting…' : 'Confirm Reject'}</SecondaryButton>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <SecondaryButton tone="danger" onClick={() => setRejecting(true)} disabled={busy} icon={<Icon name="xCircle" size={14} />}>Reject</SecondaryButton>
              <PrimaryButton onClick={() => onApprove(application.id)} disabled={busy} icon={<Icon name="checkCircle" size={14} />}>
                {busy ? 'Approving…' : 'Approve'}
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}

export default function ExpenseClaimsFinalApprovalPage() {
  const [searchParams] = useSearchParams()
  const [items, setItems] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [previewId, setPreviewId] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await expenseClaimsAPI.pendingFinalApproval()
      setItems(data.applications)
      setSelected(prev => new Set([...prev].filter(id => data.applications.some(i => i.id === id))))
    } catch { toast.error('Failed to load pending expense claims'); setItems([]) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    const appId = searchParams.get('application')
    if (appId && items?.some(i => i.id === appId)) setPreviewId(appId)
  }, [items, searchParams])

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleAll = () => {
    if (!items) return
    setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)))
  }

  const approveIds = async (ids) => {
    setBusy(true)
    try {
      const { data } = await expenseClaimsAPI.finalApprove(ids)
      const failed = data.results.filter(r => !r.ok)
      const pushFailed = data.results.filter(r => r.ok && r.push_status !== 'pushed')
      if (failed.length === 0 && pushFailed.length === 0) toast.success(`${data.results.length} claim(s) approved and posted to ERPNext`)
      else toast.error(`${data.results.length - failed.length - pushFailed.length} posted cleanly, ${pushFailed.length} had a push issue, ${failed.length} failed`)
      setSelected(new Set()); setPreviewId(null); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to approve') } finally { setBusy(false) }
  }

  const rejectIds = async (ids, reason) => {
    if (!reason.trim()) return toast.error('A reason is required to reject.')
    setBusy(true)
    try {
      await expenseClaimsAPI.finalReject(ids, reason)
      toast.success(`${ids.length} claim(s) sent back to the Accountant`)
      setSelected(new Set()); setRejecting(false); setRejectReason(''); setPreviewId(null); load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to reject') } finally { setBusy(false) }
  }

  const previewApp = items?.find(a => a.id === previewId) || null

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Expense Claims · Final Approval"
        sub="Accountant-approved claims awaiting final approval before they post to ERPNext."
      />

      {rejecting && (
        <div className="mb-4 p-4 rounded-lg border border-slate-200 bg-white">
          <div className="text-sm font-semibold text-slate-700 mb-2">Reject {selected.size} claim(s)</div>
          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} placeholder="Reason for rejecting (required)"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
          <div className="flex gap-2 mt-2">
            <SecondaryButton onClick={() => { setRejecting(false); setRejectReason('') }}>Cancel</SecondaryButton>
            <SecondaryButton tone="danger" onClick={() => rejectIds([...selected], rejectReason)} disabled={busy}>{busy ? 'Rejecting…' : 'Confirm Reject'}</SecondaryButton>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <DataTable
          columns={[
            { key: 'employee_display_name', label: 'Employee', sortable: true },
            { key: 'project_name', label: 'Project', sortable: true, render: r => r.project_name || r.project_id },
            { key: 'total_claimed_amount', label: 'Amount', align: 'right', sortable: true, render: r => `SAR ${r.total_claimed_amount}` },
            { key: 'accountant_reviewed_by_name', label: 'Reviewed By', sortable: true },
            { key: 'accountant_reviewed_at', label: 'Reviewed', sortable: true, render: r => fmtClaimDate(r.accountant_reviewed_at) },
          ]}
          rows={items || []}
          loading={items === null}
          searchKeys={['employee_display_name', 'project_name']}
          onRowClick={row => setPreviewId(row.id)}
          selection={{ selectedIds: selected, onToggle: toggle, onToggleAll: toggleAll }}
          bulkActions={[
            { key: 'approve', label: 'Approve', icon: <Icon name="checkCircle" size={14} />, onClick: ids => approveIds(ids) },
            { key: 'reject', label: 'Reject', tone: 'danger', icon: <Icon name="xCircle" size={14} />, onClick: () => setRejecting(true) },
          ]}
          emptyTitle="Nothing awaiting final approval"
        />
      </div>
      <p className="text-xs text-slate-400 mt-2">Click a row to view its receipts and PDF before approving. Check its box to include it in a bulk action.</p>

      <ClaimPreviewDrawer
        application={previewApp}
        onClose={() => setPreviewId(null)}
        onApprove={id => approveIds([id])}
        onReject={(id, reason) => rejectIds([id], reason)}
        busy={busy}
      />
    </div>
  )
}
