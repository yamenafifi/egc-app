import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { deductionsAPI } from '@/services/api'
import { PageHeader, SecondaryButton, PrimaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Drawer from '@/desktop/components/Drawer'

const todayISO = () => new Date().toISOString().slice(0, 10)
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ConvertDrawer({ request, onClose, onActioned }) {
  const [categories, setCategories] = useState(null)
  const [category, setCategory] = useState('')
  const [amount, setAmount] = useState('')
  const [hours, setHours] = useState('')
  const [percentage, setPercentage] = useState('')
  const [deductionDate, setDeductionDate] = useState(todayISO())
  const [dismissing, setDismissing] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!request) return
    setCategory(''); setAmount(request.suggested_amount ?? ''); setHours(request.suggested_hours ?? '')
    setPercentage(''); setDeductionDate(request.incident_date ? request.incident_date.slice(0, 10) : todayISO())
    setDismissing(false); setNote('')
    deductionsAPI.categories().then(({ data }) => setCategories(data.categories || [])).catch(() => toast.error('Failed to load categories'))
  }, [request])

  if (!request) return null
  const selectedCategory = categories?.find(cat => cat.category_code === category)
  const method = selectedCategory?.calculation_method

  const convert = async () => {
    if (!category) return toast.error('Select a deduction category.')
    if (method === 'Fixed Amount' && !amount) return toast.error('Amount is required.')
    if (method === 'Hourly Rate' && !hours) return toast.error('Hours is required.')
    if (method === 'Percentage of Basic' && !percentage) return toast.error('Percentage is required.')
    setBusy(true)
    try {
      const { data } = await deductionsAPI.convertRequest(request.id, {
        category, deduction_date: deductionDate,
        amount: method === 'Fixed Amount' ? Number(amount) : undefined,
        hours: method === 'Hourly Rate' ? Number(hours) : undefined,
        percentage: method === 'Percentage of Basic' ? Number(percentage) : undefined,
      })
      if (data.request.push_status !== 'pushed') toast.error(`Converted, but didn't reach payroll: ${data.request.push_detail || 'unknown error'}`)
      else toast.success('Deduction created')
      onActioned(); onClose()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to convert request') } finally { setBusy(false) }
  }

  const dismiss = async () => {
    if (!note.trim()) return toast.error('A reason is required to dismiss.')
    setBusy(true)
    try { await deductionsAPI.dismissRequest(request.id, note); toast.success('Request dismissed'); onActioned(); onClose() }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to dismiss') } finally { setBusy(false) }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg'
  const labelClass = 'block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5'

  return (
    <Drawer open={!!request} onClose={onClose} title={request.employee_display_name} sub={`${request.category_hint} · flagged by ${request.requested_by_display_name}`}>
      <div className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 mb-4">{request.description}</div>
      {(request.suggested_amount || request.suggested_hours) && (
        <div className="text-xs text-slate-400 mb-4">
          Supervisor suggested: {request.suggested_amount ? `SAR ${request.suggested_amount}` : ''}
          {request.suggested_amount && request.suggested_hours ? ' · ' : ''}
          {request.suggested_hours ? `${request.suggested_hours}h` : ''}
        </div>
      )}

      {dismissing ? (
        <div className="flex flex-col gap-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Reason for dismissing (required)" className={inputClass} />
          <div className="flex gap-2">
            <SecondaryButton onClick={() => setDismissing(false)}>Back</SecondaryButton>
            <SecondaryButton tone="danger" onClick={dismiss} disabled={busy}>{busy ? 'Dismissing…' : 'Confirm Dismiss'}</SecondaryButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>Deduction Category</label>
            {categories === null ? <div className="text-sm text-slate-400">Loading…</div> : (
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
                <option value="" disabled>Select…</option>
                {categories.map(cat => <option key={cat.category_code} value={cat.category_code}>{cat.label_en} ({cat.calculation_method})</option>)}
              </select>
            )}
          </div>
          {method === 'Fixed Amount' && (
            <div><label className={labelClass}>Amount (SAR)</label><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} /></div>
          )}
          {method === 'Hourly Rate' && (
            <div><label className={labelClass}>Hours</label><input type="number" min="0" step="0.25" value={hours} onChange={e => setHours(e.target.value)} className={inputClass} /></div>
          )}
          {method === 'Percentage of Basic' && (
            <div><label className={labelClass}>Percentage</label><input type="number" min="0" max="100" step="0.5" value={percentage} onChange={e => setPercentage(e.target.value)} className={inputClass} /></div>
          )}
          <div><label className={labelClass}>Deduction Date</label><input type="date" value={deductionDate} max={todayISO()} onChange={e => setDeductionDate(e.target.value)} className={inputClass} /></div>
          <div className="flex gap-2">
            <SecondaryButton tone="danger" onClick={() => setDismissing(true)} disabled={busy} icon={<Icon name="xCircle" size={14} />}>Dismiss</SecondaryButton>
            <PrimaryButton onClick={convert} disabled={busy || !category} icon={<Icon name="checkCircle" size={14} />}>{busy ? 'Creating…' : 'Create Deduction'}</PrimaryButton>
          </div>
        </div>
      )}
    </Drawer>
  )
}

function AppealDrawer({ deduction, onClose, onActioned }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setNotes(''), [deduction])
  if (!deduction) return null

  const resolve = async (outcome) => {
    setBusy(true)
    try {
      await deductionsAPI.resolveAppeal(deduction.deduction, outcome, notes || undefined)
      toast.success(outcome === 'Upheld' ? 'Appeal upheld - deduction stands' : 'Appeal overturned - deduction cancelled')
      onActioned(); onClose()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to resolve appeal') } finally { setBusy(false) }
  }

  return (
    <Drawer open={!!deduction} onClose={onClose} title={deduction.employee} sub={`${deduction.category} · SAR ${deduction.amount}`}>
      <div className="space-y-4 text-sm">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Reason for deduction</div>
          <div className="text-slate-700 bg-slate-50 rounded-lg p-3">{deduction.reason}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">Employee's appeal</div>
          <div className="text-slate-700 bg-amber-50 border border-amber-200 rounded-lg p-3">{deduction.appeal_reason}</div>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Resolution Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <SecondaryButton tone="danger" onClick={() => resolve('Overturned')} disabled={busy} icon={<Icon name="xCircle" size={14} />}>Overturn</SecondaryButton>
          <PrimaryButton onClick={() => resolve('Upheld')} disabled={busy} icon={<Icon name="checkCircle" size={14} />}>Uphold</PrimaryButton>
        </div>
      </div>
    </Drawer>
  )
}

export default function DeductionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') === 'appeals' ? 'appeals' : 'requests')
  const [requests, setRequests] = useState(null)
  const [appeals, setAppeals] = useState(null)
  const [openRequest, setOpenRequest] = useState(null)
  const [openAppeal, setOpenAppeal] = useState(null)
  const [bulkIds, setBulkIds] = useState(new Set())
  const [dismissing, setDismissing] = useState(false)
  const [dismissNote, setDismissNote] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  const loadRequests = useCallback(async () => {
    try {
      const { data } = await deductionsAPI.pendingRequests()
      setRequests(data.requests)
      setBulkIds(prev => new Set([...prev].filter(id => (data.requests || []).some(r => r.id === id))))
    } catch { setRequests([]) }
  }, [])
  const loadAppeals = useCallback(async () => {
    try {
      const { data } = await deductionsAPI.pendingAppeals()
      setAppeals(data.deductions)
      setBulkIds(prev => new Set([...prev].filter(id => (data.deductions || []).some(d => d.deduction === id))))
    } catch { setAppeals([]) }
  }, [])
  useEffect(() => { loadRequests(); loadAppeals() }, [loadRequests, loadAppeals])

  const handleTabChange = (key) => { setTab(key); setBulkIds(new Set()); setDismissing(false); setSearchParams(key === 'requests' ? {} : { tab: key }) }

  const toggleBulk = (id) => setBulkIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleBulkAll = () => {
    const list = tab === 'requests' ? requests : appeals
    if (!list) return
    const idOf = tab === 'requests' ? (r => r.id) : (r => r.deduction)
    setBulkIds(prev => prev.size === list.length ? new Set() : new Set(list.map(idOf)))
  }
  const dismissBulk = async () => {
    if (!dismissNote.trim()) return toast.error('A reason is required to dismiss.')
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => deductionsAPI.dismissRequest(id, dismissNote)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`${ids.length} request(s) dismissed`)
      else toast.error(`${ids.length - failed} dismissed, ${failed} failed`)
      setBulkIds(new Set()); setDismissing(false); setDismissNote(''); loadRequests()
    } finally { setBulkBusy(false) }
  }
  const resolveAppealsBulk = async (outcome) => {
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => deductionsAPI.resolveAppeal(id, outcome)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`${ids.length} appeal(s) ${outcome === 'Upheld' ? 'upheld' : 'overturned'}`)
      else toast.error(`${ids.length - failed} resolved, ${failed} failed`)
      setBulkIds(new Set()); loadAppeals()
    } finally { setBulkBusy(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Deductions" sub="Supervisor-flagged requests and employee appeals awaiting review." />

      <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
        {[['requests', 'Requests', requests], ['appeals', 'Appeals', appeals]].map(([key, label, list]) => (
          <button key={key} onClick={() => handleTabChange(key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            {label}{list?.length ? ` (${list.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'requests' && dismissing && (
        <div className="mb-4 p-4 rounded-lg border border-slate-200 bg-white">
          <div className="text-sm font-semibold text-slate-700 mb-2">Dismiss {bulkIds.size} request(s)</div>
          <textarea value={dismissNote} onChange={e => setDismissNote(e.target.value)} rows={2} placeholder="Reason for dismissing (required)"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
          <div className="flex gap-2 mt-2">
            <SecondaryButton onClick={() => { setDismissing(false); setDismissNote('') }}>Cancel</SecondaryButton>
            <SecondaryButton tone="danger" onClick={dismissBulk} disabled={bulkBusy}>{bulkBusy ? 'Dismissing…' : 'Confirm Dismiss'}</SecondaryButton>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {tab === 'requests' ? (
          <DataTable
            columns={[
              { key: 'employee_display_name', label: 'Employee', sortable: true },
              { key: 'category_hint', label: 'Category', sortable: true },
              { key: 'incident_date', label: 'Incident Date', sortable: true, render: r => fmtDate(r.incident_date) },
              { key: 'requested_by_display_name', label: 'Flagged By', sortable: true },
              { key: 'suggested_amount', label: 'Suggested', align: 'right', render: r => r.suggested_amount ? `SAR ${r.suggested_amount}` : r.suggested_hours ? `${r.suggested_hours}h` : '—' },
            ]}
            rows={requests || []}
            loading={requests === null}
            searchKeys={['employee_display_name', 'category_hint']}
            onRowClick={setOpenRequest}
            selection={{ selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll }}
            bulkActions={[
              { key: 'dismiss', label: 'Dismiss', tone: 'danger', icon: <Icon name="xCircle" size={14} />, onClick: () => setDismissing(true) },
            ]}
            emptyTitle="Nothing pending"
          />
        ) : (
          <DataTable
            columns={[
              { key: 'employee', label: 'Employee', sortable: true },
              { key: 'category', label: 'Category', sortable: true },
              { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: r => `SAR ${r.amount}` },
              { key: 'deduction_date', label: 'Date', sortable: true, render: r => fmtDate(r.deduction_date) },
            ]}
            rows={appeals || []}
            loading={appeals === null}
            keyField="deduction"
            searchKeys={['employee', 'category']}
            onRowClick={setOpenAppeal}
            selection={{ selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll }}
            bulkActions={[
              { key: 'uphold', label: 'Uphold', icon: <Icon name="checkCircle" size={14} />, onClick: () => resolveAppealsBulk('Upheld') },
              { key: 'overturn', label: 'Overturn', tone: 'danger', icon: <Icon name="xCircle" size={14} />, onClick: () => resolveAppealsBulk('Overturned') },
            ]}
            emptyTitle="No pending appeals"
          />
        )}
      </div>

      <ConvertDrawer request={openRequest} onClose={() => setOpenRequest(null)} onActioned={loadRequests} />
      <AppealDrawer deduction={openAppeal} onClose={() => setOpenAppeal(null)} onActioned={loadAppeals} />
    </div>
  )
}
