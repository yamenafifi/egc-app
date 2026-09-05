import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { expenseClaimsAPI, expenseCategoriesAPI, attendanceAPI } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { useExpenseClaimPolling } from '@/hooks/useExpenseClaimPolling'
import { statusBadge as statusTone, fmtClaimDate } from '@/utils/expenseClaims'
import { PageHeader, SecondaryButton, PrimaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Badge from '@/desktop/components/Badge'
import Drawer from '@/desktop/components/Drawer'
import JobStatusPanel from '@/desktop/components/JobStatusPanel'

const initials = n => n?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

function NewClaimForEmployeeModal({ onClose, onCreated }) {
  const [employees, setEmployees] = useState([])
  const [employeesLoading, setEmployeesLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [sites, setSites] = useState(null)
  const [projectId, setProjectId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    expenseClaimsAPI.listEmployees().then(({ data }) => setEmployees(data.employees || []))
      .catch(() => toast.error('Failed to load employees')).finally(() => setEmployeesLoading(false))
    attendanceAPI.sites().then(({ data }) => setSites(data.sites || [])).catch(() => { toast.error('Failed to load projects'); setSites([]) })
  }, [])

  const filtered = employees.filter(e => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return e.display_name?.toLowerCase().includes(q) || e.username?.toLowerCase().includes(q)
  })

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') return toast.error('Please choose a PDF file.')
    if (f.size > 45 * 1024 * 1024) return toast.error('File is too large (45MB limit).')
    setFile(f)
  }

  const handleSubmit = async () => {
    if (!selected) return toast.error('Select an employee.')
    if (!projectId) return toast.error('Select the project these expenses are for.')
    if (!file) return toast.error('Attach a PDF of the receipts.')
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('employee_user_id', selected.id)
      formData.append('project_id', projectId)
      formData.append('purpose', purpose)
      formData.append('pdf', file)
      await expenseClaimsAPI.submitForEmployee(formData)
      toast.success(`Expense claim submitted for ${selected.display_name}`)
      onCreated()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to submit expense claim') } finally { setSubmitting(false) }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white'
  const labelClass = 'block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg w-full max-w-xl shadow-popover flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New Claim for Employee</h2>
            <p className="text-xs text-slate-400 mt-0.5">Submit a receipts PDF on behalf of an employee with an EGC App account.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center shrink-0">
            <Icon name="x" size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto desktop-scrollbar flex-1 flex flex-col gap-4">
          <div>
            <label className={labelClass}>Employee</label>
            <div className="relative mb-2">
              <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or username…" className={`${inputClass} pl-9`} />
            </div>
            <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto desktop-scrollbar">
              {employeesLoading ? (
                <div className="p-4 text-sm text-slate-400">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-4 text-sm text-slate-400">No matching employees with an EGC App account.</div>
              ) : filtered.map(emp => {
                const isSel = selected?.id === emp.id
                return (
                  <div key={emp.id} onClick={() => setSelected(emp)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-100 last:border-0 cursor-pointer ${isSel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">{initials(emp.display_name)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{emp.display_name}</div>
                      <div className="text-xs text-slate-400">{emp.username}{emp.department && ` · ${emp.department}`}</div>
                    </div>
                    {isSel && <Icon name="check" size={16} className="text-blue-600" />}
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <label className={labelClass}>Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} disabled={sites === null} className={inputClass}>
              <option value="" disabled>{sites === null ? 'Loading…' : 'Select…'}</option>
              {(sites || []).map(s => <option key={s.name} value={s.name}>{s.project_name || s.name}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Purpose <span className="normal-case font-normal text-slate-400">(optional)</span></label>
            <textarea rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="What were these expenses for?" className={`${inputClass} resize-y`} />
          </div>

          <div>
            <label className={labelClass}>Receipts (PDF)</label>
            <label className="flex flex-col items-center justify-center gap-1 p-5 border border-dashed border-slate-300 rounded-lg bg-slate-50 cursor-pointer text-center hover:bg-slate-100">
              <Icon name="upload" size={18} className="text-slate-400" />
              <span className="text-sm font-semibold text-slate-600">{file ? file.name : 'Click to choose a PDF'}</span>
              <span className="text-xs text-slate-400">All receipts in one file — a receipt can span multiple pages</span>
              <input type="file" accept="application/pdf" onChange={handleFile} className="hidden" />
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Claim'}</PrimaryButton>
        </div>
      </div>
    </div>
  )
}


function Field({ label, value, onChange, onBlur, type = 'text', disabled }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      <input
        type={type} value={value ?? ''} disabled={disabled}
        onChange={e => onChange(type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
        onBlur={onBlur}
        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options, disabled }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      <select
        value={value ?? ''} disabled={disabled}
        onChange={e => onChange(e.target.value || null)}
        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
      >
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function ReceiptCard({ receipt, index, applicationId, categories, onSaved, disabled }) {
  const [local, setLocal] = useState(receipt)
  useEffect(() => setLocal(receipt), [receipt])

  const patch = (field, value) => setLocal(prev => ({ ...prev, [field]: value }))
  const commit = async (field) => {
    if (local[field] === receipt[field]) return
    try {
      const { data } = await expenseClaimsAPI.updateReceipt(applicationId, index, { [field]: local[field] })
      onSaved(data.application)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save'); setLocal(receipt) }
  }
  // select/checkbox fields commit immediately on change rather than on blur
  // (a native <select> doesn't reliably blur right after a choice, and a
  // checkbox has no blur concept at all worth waiting for).
  const commitValue = async (field, value) => {
    patch(field, value)
    if (value === receipt[field]) return
    try {
      const { data } = await expenseClaimsAPI.updateReceipt(applicationId, index, { [field]: value })
      onSaved(data.application)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save'); setLocal(receipt) }
  }
  const toggleIncluded = async () => {
    try { const { data } = await expenseClaimsAPI.updateReceipt(applicationId, index, { included: !local.included }); onSaved(data.application) }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to save') }
  }
  const viewPdf = async () => {
    try { const { data } = await expenseClaimsAPI.receiptPdf(applicationId, index); window.open(URL.createObjectURL(data), '_blank') }
    catch { toast.error("Failed to load this receipt's PDF") }
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-3.5 ${local.included ? '' : 'opacity-50'}`}>
      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer">
          <input type="checkbox" checked={local.included} disabled={disabled} onChange={toggleIncluded} />
          Pages {receipt.page_start}–{receipt.page_end}
        </label>
        <button onClick={viewPdf} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
          <Icon name="fileText" size={13} /> View PDF
        </button>
      </div>
      {receipt.confidence_notes && (
        <div className="flex gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1.5 mb-2.5">
          <Icon name="alertCircle" size={13} className="shrink-0 mt-0.5" /> {receipt.confidence_notes}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Vendor" value={local.vendor_name} disabled={disabled} onChange={v => patch('vendor_name', v)} onBlur={() => commit('vendor_name')} />
        <Field label="VAT Number" value={local.vat_number} disabled={disabled} onChange={v => patch('vat_number', v)} onBlur={() => commit('vat_number')} />
        <Field label="Receipt Number" value={local.receipt_number} disabled={disabled} onChange={v => patch('receipt_number', v)} onBlur={() => commit('receipt_number')} />
        <Field label="Date" type="date" value={local.receipt_date} disabled={disabled} onChange={v => patch('receipt_date', v)} onBlur={() => commit('receipt_date')} />
        <Field label="Subtotal (SAR)" type="number" value={local.subtotal_amount} disabled={disabled} onChange={v => patch('subtotal_amount', v)} onBlur={() => commit('subtotal_amount')} />
        <Field label="Discount (SAR)" type="number" value={local.discount_amount} disabled={disabled} onChange={v => patch('discount_amount', v)} onBlur={() => commit('discount_amount')} />
        <Field label="VAT (SAR)" type="number" value={local.vat_amount} disabled={disabled} onChange={v => patch('vat_amount', v)} onBlur={() => commit('vat_amount')} />
        <Field label="Total (SAR)" type="number" value={local.total_amount} disabled={disabled} onChange={v => patch('total_amount', v)} onBlur={() => commit('total_amount')} />
        <SelectField label="Category" value={local.expense_category} disabled={disabled}
          onChange={v => commitValue('expense_category', v)} options={categories.map(c => c.name)} />
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
            <input type="checkbox" checked={!!local.our_vat_number_present} disabled={disabled}
              onChange={e => commitValue('our_vat_number_present', e.target.checked)} />
            Our VAT number is present
          </label>
        </div>
      </div>
      <div className="mt-2.5">
        <Field label="Description (EN)" value={local.description_en} disabled={disabled} onChange={v => patch('description_en', v)} onBlur={() => commit('description_en')} />
      </div>
      <div className="mt-2.5">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Description (AR)</label>
        <input dir="rtl" value={local.description_ar || ''} disabled={disabled} onChange={e => patch('description_ar', e.target.value)}
          onBlur={() => commit('description_ar')} className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md" />
      </div>
    </div>
  )
}

function ReviewDrawer({ application, categories, onClose, onChanged }) {
  const [sourcePdfUrl, setSourcePdfUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    setSourcePdfUrl(null)
    if (!application) return
    expenseClaimsAPI.sourcePdf(application.id).then(({ data }) => setSourcePdfUrl(URL.createObjectURL(data))).catch(() => toast.error('Failed to load the source PDF'))
  }, [application?.id])

  if (!application) return null
  const jobInFlight = application.job_status === 'queued' || application.job_status === 'running'

  const startProcessing = async () => {
    try { const { data } = await expenseClaimsAPI.process(application.id); toast.success(data.message || 'Extraction job started'); onChanged(data.application) }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to start extraction') }
  }
  const approve = async () => {
    if (!application.receipts.some(r => r.included)) return toast.error('At least one receipt must stay Included.')
    setBusy(true)
    try { const { data } = await expenseClaimsAPI.approve(application.id); toast.success('Approved - sent for final approval'); onChanged(data.application) }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to approve') } finally { setBusy(false) }
  }
  const reject = async () => {
    if (!rejectReason.trim()) return toast.error('A reason is required to reject.')
    setBusy(true)
    try {
      const { data } = await expenseClaimsAPI.reject(application.id, rejectReason)
      toast.success('Sent back for correction'); setRejecting(false); setRejectReason(''); onChanged(data.application)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to reject') } finally { setBusy(false) }
  }

  return (
    <Drawer open={!!application} onClose={onClose} width="min(1600px, 94vw)"
      title={application.employee_display_name}
      sub={`${application.project_name || application.project_id} · ${fmtClaimDate(application.submitted_at)}`}>
      <div className="flex gap-5 h-full min-h-[720px]">
        <div className="flex-[3] min-w-0 bg-slate-100 rounded-lg overflow-hidden">
          {sourcePdfUrl
            ? <iframe src={sourcePdfUrl} title="Receipts PDF" className="w-full h-full border-0" />
            : <div className="flex items-center justify-center h-full text-sm text-slate-400">Loading PDF…</div>}
        </div>

        <div className="flex-[2] min-w-[360px] overflow-y-auto desktop-scrollbar pr-1">
          <div className="flex items-center justify-between mb-1">
            <Badge tone={statusTone(application.status).tone}>{statusTone(application.status).label}</Badge>
          </div>
          {application.created_by_display_name && (
            <div className="text-xs text-slate-400 mt-1.5">Submitted by {application.created_by_display_name} on the employee's behalf</div>
          )}
          {application.purpose && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 mt-3">{application.purpose}</div>}

          {application.rejection_reason && (
            <div className="flex gap-2 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <Icon name="alertCircle" size={13} className="shrink-0 mt-0.5" /> Sent back at final approval: {application.rejection_reason}
            </div>
          )}

          <div className="mt-3"><JobStatusPanel application={application} /></div>

          {(application.status === 'submitted' || application.status === 'processing') && (
            <PrimaryButton onClick={startProcessing} disabled={jobInFlight}>
              {jobInFlight ? 'Extracting…' : application.receipts.length ? 'Re-run Processing' : 'Start Processing'}
            </PrimaryButton>
          )}

          {application.status === 'extracted' && (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mt-5 mb-2.5">
                {application.receipts.length} Receipt{application.receipts.length !== 1 ? 's' : ''} · Total SAR {application.total_claimed_amount}
              </div>
              <div className="flex flex-col gap-3">
                {application.receipts.map((r, i) => (
                  <ReceiptCard key={i} receipt={r} index={i} applicationId={application.id} categories={categories} onSaved={onChanged} disabled={busy} />
                ))}
              </div>

              {rejecting ? (
                <div className="mt-4 flex flex-col gap-2">
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Reason for rejecting (required)"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => { setRejecting(false); setRejectReason('') }}>Cancel</SecondaryButton>
                    <SecondaryButton tone="danger" onClick={reject} disabled={busy}>{busy ? 'Sending…' : 'Confirm Reject'}</SecondaryButton>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-5">
                  <SecondaryButton tone="danger" onClick={() => setRejecting(true)} disabled={busy} icon={<Icon name="xCircle" size={14} />}>Reject</SecondaryButton>
                  <PrimaryButton onClick={approve} disabled={busy} icon={<Icon name="checkCircle" size={14} />}>{busy ? 'Approving…' : 'Approve'}</PrimaryButton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Drawer>
  )
}

const PROCESSABLE = new Set(['submitted', 'accountant_approved'])

export default function ExpenseClaimsReviewPage() {
  const { hasPermission } = useAuth()
  const [searchParams] = useSearchParams()
  const [applications, setApplications] = useState(null)
  const [categories, setCategories] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [autoOpenChecked, setAutoOpenChecked] = useState(false)
  const [bulkIds, setBulkIds] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [creatingFor, setCreatingFor] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await expenseClaimsAPI.pendingReview()
      setApplications(data.applications)
      setBulkIds(prev => new Set([...prev].filter(id => data.applications.some(a => a.id === id))))
    }
    catch { toast.error('Failed to load expense claims'); setApplications([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const processable = (applications || []).filter(a => PROCESSABLE.has(a.status))
  const toggleBulk = (id) => setBulkIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleBulkAll = () => setBulkIds(prev => prev.size === processable.length ? new Set() : new Set(processable.map(a => a.id)))
  const startProcessingBulk = async (ids) => {
    setBulkBusy(true)
    try {
      const results = await Promise.allSettled(ids.map(id => expenseClaimsAPI.process(id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`Extraction started for ${ids.length} claim(s)`)
      else toast.error(`${ids.length - failed} started, ${failed} failed`)
      setBulkIds(new Set()); load()
    } finally { setBulkBusy(false) }
  }
  useEffect(() => { expenseCategoriesAPI.list().then(({ data }) => setCategories(data.categories)).catch(() => {}) }, [])

  useEffect(() => {
    if (autoOpenChecked || applications === null) return
    const appId = searchParams.get('application')
    if (appId && applications.some(a => a.id === appId)) setSelectedId(appId)
    setAutoOpenChecked(true)
  }, [applications, searchParams, autoOpenChecked])

  const selected = applications?.find(a => a.id === selectedId) || null
  const handleChanged = (updated) => {
    setApplications(prev => (prev || []).map(a => a.id === updated.id ? updated : a))
    if (updated.status === 'accountant_approved') setSelectedId(null)
  }
  useExpenseClaimPolling(selected, handleChanged)

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Expense Claims" sub="Process AI extraction and give the first approval before final review."
        action={hasPermission('expense_claims.create_for_employee') && (
          <PrimaryButton onClick={() => setCreatingFor(true)} icon={<Icon name="plus" size={14} />}>New Claim for Employee</PrimaryButton>
        )} />
      <div className="flex-1 min-h-0">
        <DataTable
          columns={[
            { key: 'employee_display_name', label: 'Employee', sortable: true },
            { key: 'project_name', label: 'Project', sortable: true, render: r => r.project_name || r.project_id },
            { key: 'total_claimed_amount', label: 'Amount', align: 'right', sortable: true, render: r => r.total_claimed_amount ? `SAR ${r.total_claimed_amount}` : '—' },
            { key: 'status', label: 'Status', sortable: true, render: r => <Badge tone={statusTone(r.status).tone}>{statusTone(r.status).label}</Badge> },
            { key: 'submitted_at', label: 'Submitted', sortable: true, render: r => fmtClaimDate(r.submitted_at) },
          ]}
          rows={applications || []}
          loading={applications === null}
          searchKeys={['employee_display_name', 'project_name']}
          onRowClick={row => setSelectedId(row.id)}
          selection={processable.length > 0 ? { selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll } : undefined}
          bulkActions={[
            { key: 'process', label: 'Start Processing', icon: <Icon name="playCircle" size={14} />, onClick: startProcessingBulk },
          ]}
          emptyTitle="Nothing to review"
        />
      </div>
      <ReviewDrawer application={selected} categories={categories} onClose={() => setSelectedId(null)} onChanged={handleChanged} />
      {creatingFor && (
        <NewClaimForEmployeeModal onClose={() => setCreatingFor(false)} onCreated={() => { setCreatingFor(false); load() }} />
      )}
    </div>
  )
}
