import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { useExpenseClaimPolling } from '@/hooks/useExpenseClaimPolling'
import { expenseClaimsAPI } from '@/services/api'
import { statusBadge, fmtClaimDate } from '@/utils/expenseClaims'
import { PageHeader, Panel, SecondaryButton } from '@/desktop/components/Page'
import Badge from '@/desktop/components/Badge'
import JobStatusPanel from '@/desktop/components/JobStatusPanel'


function TimelineStep({ label, state, note }) {
  const dot = state === 'done' ? 'bg-emerald-100 border-emerald-500 text-emerald-600'
    : state === 'active' ? 'bg-blue-100 border-blue-500' : 'bg-slate-100 border-slate-300'
  return (
    <div className="flex gap-3">
      <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${dot}`}>
        {state === 'done' && <Icon name="check" size={10} />}
      </div>
      <div className="pb-5">
        <div className={`text-sm font-semibold ${state === 'pending' ? 'text-slate-400' : 'text-slate-800'}`}>{label}</div>
        {note && <div className="text-xs text-slate-400 mt-0.5">{note}</div>}
      </div>
    </div>
  )
}

function Timeline({ app }) {
  const rank = { submitted: 0, processing: 0, extracted: 1, accountant_approved: 2, approved: 3 }[app.status] ?? 0
  return (
    <div>
      <TimelineStep label="Submitted" state="done" note={fmtClaimDate(app.submitted_at)} />
      <TimelineStep label="Extraction & Accountant Review" state={rank > 1 ? 'done' : rank === 1 || app.status === 'processing' ? 'active' : 'pending'}
        note={app.accountant_reviewed_by_name ? `Reviewed by ${app.accountant_reviewed_by_name}` : undefined} />
      <TimelineStep label="Final Approval" state={rank > 2 ? 'done' : rank === 2 ? 'active' : 'pending'}
        note={app.final_reviewed_by_name ? `Reviewed by ${app.final_reviewed_by_name}` : undefined} />
      <TimelineStep label="Approved" state={app.status === 'approved' ? 'done' : 'pending'}
        note={app.status === 'approved' && app.push_status === 'pushed' ? 'Posted to ERPNext' : undefined} />
    </div>
  )
}

export default function ExpenseClaimDetailPage() {
  const { id } = useParams()
  const [application, setApplication] = useState(undefined)
  const [error, setError] = useState(null)
  const [sourcePdfUrl, setSourcePdfUrl] = useState(null)
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const load = useCallback(async () => {
    try { const { data } = await expenseClaimsAPI.get(id); setApplication(data.application) }
    catch (e) { setApplication(null); setError(e.response?.data?.error || 'Failed to load this expense claim.') }
  }, [id])
  useEffect(() => { load() }, [load])
  useExpenseClaimPolling(application, setApplication)

  const withdraw = async () => {
    setWithdrawing(true)
    try {
      const { data } = await expenseClaimsAPI.withdraw(id)
      setApplication(data.application)
      setConfirmingWithdraw(false)
      toast.success('Claim withdrawn.')
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to withdraw this claim') }
    finally { setWithdrawing(false) }
  }

  useEffect(() => {
    setSourcePdfUrl(null)
    if (!application) return
    expenseClaimsAPI.sourcePdf(application.id).then(({ data }) => setSourcePdfUrl(URL.createObjectURL(data))).catch(() => {})
  }, [application?.id])

  if (application === undefined) {
    return <div className="text-sm text-slate-400 py-16 text-center">Loading claim…</div>
  }
  if (application === null) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Icon name="alertCircle" size={28} className="text-red-400" />
        <div className="text-sm font-semibold text-slate-700">Can't open this claim</div>
        <div className="text-xs text-slate-400">{error}</div>
      </div>
    )
  }

  const includedReceipts = (application.receipts || []).filter(r => r.included)

  return (
    <div>
      <PageHeader title="Expense Claim" sub="Submitted, reviewed, and approved status for this claim." />
      <div className="grid grid-cols-2 gap-5 items-start">
        <Panel>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-slate-900">
                {application.total_claimed_amount ? `SAR ${application.total_claimed_amount}` : application.source_pdf_filename}
              </div>
              <div className="text-xs text-slate-400 mt-1">{application.project_name || application.project_id} · {fmtClaimDate(application.submitted_at)}</div>
            </div>
            <Badge tone={statusBadge(application.status).tone}>{statusBadge(application.status).label}</Badge>
          </div>

          {application.created_by_display_name && (
            <div className="text-xs text-slate-400 mt-1.5">Submitted by {application.created_by_display_name} on your behalf</div>
          )}

          {application.purpose && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 mt-3">{application.purpose}</div>}

          {application.rejection_reason && (
            <div className="flex gap-2 mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
              <Icon name="alertCircle" size={14} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-red-600">Sent back for correction</div>
                <div className="text-xs text-slate-600 mt-0.5">{application.rejection_reason}</div>
              </div>
            </div>
          )}

          {application.status === 'approved' && application.push_status !== 'pushed' && (
            <div className="flex gap-2 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <Icon name="alertCircle" size={14} className="shrink-0 mt-0.5" />
              Approved, but hasn't reached accounting yet ({application.push_detail || 'unknown error'}). HR has been notified.
            </div>
          )}

          <div className="mt-3"><JobStatusPanel application={application} /></div>

          {(application.status === 'submitted' || application.status === 'processing') && (
            confirmingWithdraw ? (
              <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
                <div className="text-xs text-red-700 flex-1">Withdraw this claim? This can't be undone.</div>
                <SecondaryButton onClick={() => setConfirmingWithdraw(false)}>Cancel</SecondaryButton>
                <SecondaryButton tone="danger" onClick={withdraw} disabled={withdrawing}>
                  {withdrawing ? 'Withdrawing…' : 'Confirm'}
                </SecondaryButton>
              </div>
            ) : (
              <div className="mt-3">
                <SecondaryButton tone="danger" onClick={() => setConfirmingWithdraw(true)} icon={<Icon name="xCircle" size={14} />}>
                  Withdraw Claim
                </SecondaryButton>
              </div>
            )
          )}

          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-6 mb-3">Status</div>
          <Timeline app={application} />

          {includedReceipts.length > 0 && (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">
                {includedReceipts.length} Receipt{includedReceipts.length !== 1 ? 's' : ''}
              </div>
              <div className="flex flex-col gap-2">
                {includedReceipts.map((r, i) => (
                  <div key={i} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex justify-between text-sm font-semibold text-slate-700">
                      <span>{r.vendor_name || 'Unknown vendor'}</span>
                      <span>{r.total_amount != null ? `SAR ${r.total_amount}` : '—'}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {r.receipt_date ? fmtClaimDate(r.receipt_date) : 'Date unknown'}{r.description_en ? ` · ${r.description_en}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        <div className="h-[560px] rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
          {sourcePdfUrl
            ? <iframe src={sourcePdfUrl} title="Receipts PDF" className="w-full h-full border-0" />
            : <div className="flex items-center justify-center h-full text-sm text-slate-400">Loading PDF…</div>}
        </div>
      </div>
    </div>
  )
}
