import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { expenseClaimsAPI, expenseCategoriesAPI, erpAPI } from '@/services/api'
import { PageHeader, PrimaryButton, SecondaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Badge from '@/desktop/components/Badge'
import Drawer from '@/desktop/components/Drawer'

function csvCell(value) {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(rows) {
  const columns = [
    ['vendor_name', 'Vendor'], ['employee_display_name', 'Employee'], ['project_name', 'Project'],
    ['receipt_datetime', 'Date'], ['total_amount', 'Amount (SAR)'], ['expense_category', 'Category'],
    ['vat_number', 'VAT Number'], ['our_vat_number_present', 'Our VAT Present'],
  ]
  const lines = [
    columns.map(([, label]) => csvCell(label)).join(','),
    ...rows.map(r => columns.map(([key]) => csvCell(r[key])).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `receipts-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hasTime = iso.includes('T') && !iso.endsWith('T00:00:00')
  return hasTime
    ? d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : fmtDate(iso)
}

function ReceiptDrawer({ receipt, onClose }) {
  const navigate = useNavigate()
  const [pdfUrl, setPdfUrl] = useState(null)

  useEffect(() => {
    setPdfUrl(null)
    if (!receipt) return
    expenseClaimsAPI.receiptPdf(receipt.application_id, receipt.receipt_index)
      .then(({ data }) => setPdfUrl(URL.createObjectURL(data)))
      .catch(() => toast.error("Failed to load this receipt's PDF"))
  }, [receipt?.application_id, receipt?.receipt_index])

  if (!receipt) return null
  const qr = receipt.qr_decoded

  return (
    <Drawer open={!!receipt} onClose={onClose} width="min(1400px, 92vw)" title={receipt.vendor_name || 'Unknown vendor'}
      sub={`${receipt.employee_display_name} · ${receipt.project_name || receipt.project_id}`}>
      <div className="flex gap-5 h-full min-h-[640px]">
        <div className="flex-[3] min-w-0 bg-slate-100 rounded-lg overflow-hidden">
          {pdfUrl
            ? <iframe src={pdfUrl} title="Receipt PDF" className="w-full h-full border-0" />
            : <div className="flex items-center justify-center h-full text-sm text-slate-400">Loading PDF…</div>}
        </div>

        <div className="flex-[2] min-w-[340px] overflow-y-auto desktop-scrollbar pr-1">
          <div className="flex items-center justify-between mb-4">
            <div className="text-2xl font-bold text-slate-900">{receipt.total_amount != null ? `SAR ${receipt.total_amount}` : '—'}</div>
            <button onClick={() => navigate(`/expense-claims/${receipt.application_id}`)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <Icon name="link" size={13} /> Open Claim
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mb-4">
            {receipt.expense_category && <Badge tone="purple">{receipt.expense_category}</Badge>}
            {receipt.our_vat_number_present && <Badge tone="blue">Our VAT No. Present</Badge>}
            {qr ? (
              <Badge tone="green">ZATCA Verified</Badge>
            ) : receipt.qr_decode_error ? (
              <Badge tone="orange">QR Unreadable</Badge>
            ) : (
              <Badge tone="neutral">No QR Data</Badge>
            )}
          </div>

          {receipt.description_en && <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 mb-4">{receipt.description_en}</div>}

          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              ['Receipt #', receipt.receipt_number],
              ['Date', fmtDateTime(receipt.receipt_datetime || receipt.receipt_date)],
              ['VAT Number', receipt.vat_number],
              ['Category', receipt.expense_category],
              ['Subtotal', receipt.subtotal_amount != null ? `SAR ${receipt.subtotal_amount}` : null],
              ['Discount', receipt.discount_amount != null ? `SAR ${receipt.discount_amount}` : null],
              ['VAT', receipt.vat_amount != null ? `SAR ${receipt.vat_amount}` : null],
            ].filter(([, v]) => v != null).map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{k}</div>
                <div className="text-sm text-slate-800 font-medium">{v}</div>
              </div>
            ))}
          </div>

          {receipt.line_items?.length > 0 && (
            <>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">Line Items</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-5">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-slate-500">Description</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-500">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold text-slate-500">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.line_items.map((li, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{li.description}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{li.quantity ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-700 font-medium">{li.line_total != null ? `SAR ${li.line_total}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">
            ZATCA QR Data {qr ? '(decoded)' : ''}
          </div>
          {qr ? (
            <div className="border border-emerald-200 bg-emerald-50 rounded-lg p-3 grid grid-cols-2 gap-2.5 text-xs">
              <div><span className="text-emerald-700/70 font-semibold">Seller</span><div className="text-emerald-900">{qr.seller_name || '—'}</div></div>
              <div><span className="text-emerald-700/70 font-semibold">VAT No.</span><div className="text-emerald-900">{qr.vat_number || '—'}</div></div>
              <div><span className="text-emerald-700/70 font-semibold">Timestamp</span><div className="text-emerald-900">{qr.timestamp || '—'}</div></div>
              <div><span className="text-emerald-700/70 font-semibold">Invoice Total</span><div className="text-emerald-900">{qr.invoice_total != null ? `SAR ${qr.invoice_total}` : '—'}</div></div>
              <div><span className="text-emerald-700/70 font-semibold">VAT Total</span><div className="text-emerald-900">{qr.vat_total != null ? `SAR ${qr.vat_total}` : '—'}</div></div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">{receipt.qr_decode_error || 'No QR code was found on this receipt.'}</div>
          )}

          {receipt.confidence_notes && (
            <div className="flex gap-2 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              <Icon name="alertCircle" size={13} className="shrink-0 mt-0.5" /> {receipt.confidence_notes}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}

export default function ReceiptsSearchPage() {
  const [receipts, setReceipts] = useState(null)
  const [projects, setProjects] = useState([])
  const [categories, setCategories] = useState([])
  const [filters, setFilters] = useState({ project_id: '', date_from: '', date_to: '', q: '', vat_present_only: false })
  const [selected, setSelected] = useState(null)
  const [checkedKeys, setCheckedKeys] = useState(new Set())
  const [assigning, setAssigning] = useState(false)
  const [categoryChoice, setCategoryChoice] = useState('')
  const [assignBusy, setAssignBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    erpAPI.projectSites().then(({ data }) => setProjects(data.sites || [])).catch(() => {})
    expenseCategoriesAPI.list().then(({ data }) => setCategories(data.categories)).catch(() => {})
  }, [])

  const buildParams = useCallback(() => {
    const params = {}
    if (filters.project_id) params.project_id = filters.project_id
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    if (filters.q) params.q = filters.q
    if (filters.vat_present_only) params.vat_present_only = 'true'
    return params
  }, [filters.project_id, filters.date_from, filters.date_to, filters.q, filters.vat_present_only])

  const load = useCallback(async () => {
    try {
      const { data } = await expenseClaimsAPI.searchReceipts(buildParams())
      // file_id isn't guaranteed unique across different claims - key each
      // row by (application_id, receipt_index), which always is.
      const withKeys = data.receipts.map(r => ({ ...r, _key: `${r.application_id}-${r.receipt_index}` }))
      setReceipts(withKeys)
      setCheckedKeys(prev => new Set([...prev].filter(k => withKeys.some(r => r._key === k))))
    } catch { toast.error('Failed to search receipts'); setReceipts([]) }
  }, [buildParams])

  const exportZip = async () => {
    setExporting(true)
    try {
      const { data } = await expenseClaimsAPI.exportReceiptsZip(buildParams())
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = `receipts-export-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      if (e.response?.status === 404) toast.error('No receipts match the current filters.')
      else toast.error('Failed to export receipts')
    } finally { setExporting(false) }
  }

  // Debounced - `q` changes on every keystroke and this is a real network
  // round-trip (server-side search, needed to reach line_items text - see
  // DataTable's controlled-search comment), not a free client-side filter.
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const selectClass = 'px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white'
  const totalAmount = (receipts || []).reduce((s, r) => s + (r.total_amount || 0), 0)

  const toggleChecked = (key) => setCheckedKeys(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })
  const toggleCheckedAll = () => {
    if (!receipts) return
    setCheckedKeys(prev => prev.size === receipts.length ? new Set() : new Set(receipts.map(r => r._key)))
  }

  const exportSelected = (keys) => {
    downloadCsv(receipts.filter(r => keys.includes(r._key)))
    toast.success(`Exported ${keys.length} receipt(s).`)
  }

  const assignCategory = async (keys) => {
    if (!categoryChoice) return toast.error('Choose a category first.')
    setAssignBusy(true)
    try {
      const targets = receipts.filter(r => keys.includes(r._key))
      await Promise.all(targets.map(r =>
        expenseClaimsAPI.updateReceipt(r.application_id, r.receipt_index, { expense_category: categoryChoice })
      ))
      toast.success(`Assigned "${categoryChoice}" to ${targets.length} receipt(s).`)
      setAssigning(false); setCategoryChoice(''); setCheckedKeys(new Set())
      load()
    } catch { toast.error('Failed to assign category to one or more receipts') }
    finally { setAssignBusy(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Receipts" sub="Search every extracted receipt across all expense claims - by project, date, or what was bought." />

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={filters.project_id} onChange={e => setFilters(f => ({ ...f, project_id: e.target.value }))} className={selectClass}>
          <option value="">All projects</option>
          {projects.map(p => <option key={p.name} value={p.name}>{p.project_name}</option>)}
        </select>
        <input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} className={selectClass} />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} className={selectClass} />
        <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={filters.vat_present_only} onChange={e => setFilters(f => ({ ...f, vat_present_only: e.target.checked }))} />
          Our VAT No. present only
        </label>
        {(filters.project_id || filters.date_from || filters.date_to || filters.vat_present_only) && (
          <button onClick={() => setFilters({ project_id: '', date_from: '', date_to: '', q: '', vat_present_only: false })} className="text-xs font-semibold text-slate-400 hover:text-slate-600">
            Clear filters
          </button>
        )}
        <div className="flex-1" />
        {receipts?.length > 0 && (
          <div className="text-sm text-slate-500">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''} · <span className="font-semibold text-slate-800">SAR {totalAmount.toFixed(2)}</span></div>
        )}
        <SecondaryButton onClick={exportZip} disabled={exporting || !receipts?.length} icon={<Icon name="download" size={13} />}>
          {exporting ? 'Exporting…' : 'Export ZIP'}
        </SecondaryButton>
      </div>

      {assigning && (
        <div className="mb-4 p-4 rounded-lg border border-slate-200 bg-white flex items-center gap-3">
          <div className="text-sm font-semibold text-slate-700 shrink-0">Assign category to {checkedKeys.size} receipt(s)</div>
          <select value={categoryChoice} onChange={e => setCategoryChoice(e.target.value)} className={selectClass}>
            <option value="">Select a category…</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <div className="flex-1" />
          <SecondaryButton onClick={() => { setAssigning(false); setCategoryChoice('') }}>Cancel</SecondaryButton>
          <PrimaryButton onClick={() => assignCategory([...checkedKeys])} disabled={assignBusy}>{assignBusy ? 'Assigning…' : 'Confirm'}</PrimaryButton>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <DataTable
          columns={[
            { key: 'vendor_name', label: 'Vendor', sortable: true, render: r => r.vendor_name || <span className="text-slate-400">Unknown</span> },
            { key: 'employee_display_name', label: 'Employee', sortable: true },
            { key: 'project_name', label: 'Project', sortable: true, render: r => r.project_name || r.project_id },
            { key: 'receipt_datetime', label: 'Date', sortable: true, sortValue: r => r.receipt_datetime || r.receipt_date, render: r => fmtDateTime(r.receipt_datetime || r.receipt_date) },
            { key: 'total_amount', label: 'Amount', align: 'right', sortable: true, render: r => r.total_amount != null ? `SAR ${r.total_amount}` : '—' },
            { key: 'expense_category', label: 'Category', sortable: true, render: r => r.expense_category ? <Badge tone="purple">{r.expense_category}</Badge> : <span className="text-slate-300">—</span> },
            { key: 'zatca', label: 'QR', render: r => r.qr_decoded ? <Badge tone="green">Verified</Badge> : r.qr_decode_error ? <Badge tone="orange">Unreadable</Badge> : <Badge tone="neutral">None</Badge> },
          ]}
          rows={receipts || []}
          loading={receipts === null}
          keyField="_key"
          searchPlaceholder="Search vendor, description, line items…"
          searchValue={filters.q}
          onSearchChange={q => setFilters(f => ({ ...f, q }))}
          onRowClick={setSelected}
          selection={{ selectedIds: checkedKeys, onToggle: toggleChecked, onToggleAll: toggleCheckedAll }}
          bulkActions={[
            { key: 'assign-category', label: 'Assign Category', icon: <Icon name="folder" size={14} />, onClick: () => setAssigning(true) },
            { key: 'export', label: 'Export CSV', icon: <Icon name="download" size={14} />, onClick: exportSelected },
          ]}
          emptyTitle="No receipts found"
          emptyBody="Try widening the date range or clearing filters."
        />
      </div>

      <ReceiptDrawer receipt={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
