import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { deductionsAPI } from '@/services/api'
import { PageHeader, PrimaryButton, SecondaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Badge from '@/desktop/components/Badge'
import Drawer from '@/desktop/components/Drawer'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const APPEAL_TONE = { Pending: 'orange', Upheld: 'red', Overturned: 'green' }
const APPEAL_LABEL = { Pending: 'Appeal Pending', Upheld: 'Appeal Upheld', Overturned: 'Appeal Overturned' }

function DeductionDrawer({ deduction, onClose, onActioned }) {
  const [appealing, setAppealing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setAppealing(false); setReason('') }, [deduction])
  if (!deduction) return null

  const canAppeal = !deduction.appeal_status

  const submit = async () => {
    if (!reason.trim()) return toast.error("Explain why you're appealing this.")
    setBusy(true)
    try {
      await deductionsAPI.appeal(deduction.deduction, reason)
      toast.success('Appeal submitted to HR')
      onActioned(); onClose()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to submit appeal') }
    finally { setBusy(false) }
  }

  return (
    <Drawer open={!!deduction} onClose={onClose} title={`SAR ${deduction.amount}`} sub={`${deduction.category} · ${fmtDate(deduction.deduction_date)}`}>
      {deduction.appeal_status && (
        <div className="mb-4">
          <Badge tone={APPEAL_TONE[deduction.appeal_status] || 'neutral'}>{APPEAL_LABEL[deduction.appeal_status] || deduction.appeal_status}</Badge>
        </div>
      )}

      <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Reason</div>
      <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 mb-4">{deduction.reason}</div>

      {deduction.appeal_reason && (
        <>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Your Appeal</div>
          <div className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">{deduction.appeal_reason}</div>
        </>
      )}

      {deduction.appeal_resolution_notes && (
        <>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">HR Resolution</div>
          <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 mb-4">{deduction.appeal_resolution_notes}</div>
        </>
      )}

      {canAppeal && (
        appealing ? (
          <div className="flex flex-col gap-2">
            <textarea autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={4}
              placeholder="Explain what happened from your side - HR will review this."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
            <div className="flex gap-2">
              <SecondaryButton onClick={() => setAppealing(false)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={busy}>{busy ? 'Submitting…' : 'Submit Appeal'}</PrimaryButton>
            </div>
          </div>
        ) : (
          <SecondaryButton onClick={() => setAppealing(true)} icon={<Icon name="alertCircle" size={14} />}>Appeal This Deduction</SecondaryButton>
        )
      )}
    </Drawer>
  )
}

export default function MyDeductionsPage() {
  const [deductions, setDeductions] = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    try { const { data } = await deductionsAPI.mine(); setDeductions(data.deductions) }
    catch { toast.error('Failed to load your deductions'); setDeductions([]) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="My Deductions" sub="Deductions recorded against your pay. You can appeal any that hasn't already been appealed." />
      <div className="flex-1 min-h-0">
        <DataTable
          columns={[
            { key: 'category', label: 'Category', sortable: true },
            { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: r => `SAR ${r.amount}` },
            { key: 'deduction_date', label: 'Date', sortable: true, render: r => fmtDate(r.deduction_date) },
            { key: 'reason', label: 'Reason', render: r => <span className="truncate block max-w-xs">{r.reason}</span> },
            { key: 'appeal_status', label: 'Appeal', render: r => r.appeal_status ? <Badge tone={APPEAL_TONE[r.appeal_status] || 'neutral'}>{APPEAL_LABEL[r.appeal_status] || r.appeal_status}</Badge> : <span className="text-slate-300">—</span> },
          ]}
          rows={deductions || []}
          loading={deductions === null}
          keyField="deduction"
          searchKeys={['category', 'reason']}
          onRowClick={setSelected}
          emptyTitle="No deductions on record"
        />
      </div>
      <DeductionDrawer deduction={selected} onClose={() => setSelected(null)} onActioned={load} />
    </div>
  )
}
