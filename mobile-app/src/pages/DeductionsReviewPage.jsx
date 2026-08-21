import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import BottomSheet from '@/components/ui/BottomSheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { deductionsAPI } from '@/services/api'

const todayISO = () => new Date().toISOString().slice(0, 10)

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Requests tab: convert a supervisor's flag into a real EGC Deduction, or dismiss it ──

function ConvertRequestSheet({ request, onClose, onActioned }) {
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
    setCategory('')
    setAmount(request.suggested_amount ?? '')
    setHours(request.suggested_hours ?? '')
    setPercentage('')
    setDeductionDate(request.incident_date ? request.incident_date.slice(0, 10) : todayISO())
    setDismissing(false)
    setNote('')
    deductionsAPI.categories()
      .then(({ data }) => setCategories(data.categories || []))
      .catch(() => toast.error('Failed to load deduction categories'))
  }, [request])

  if (!request) return null
  const selectedCategory = categories?.find(cat => cat.category_code === category)
  const method = selectedCategory?.calculation_method

  const handleConvert = async () => {
    if (!category) return toast.error('Select a deduction category.')
    if (method === 'Fixed Amount' && !amount) return toast.error('Amount is required for this category.')
    if (method === 'Hourly Rate' && !hours) return toast.error('Hours is required for this category.')
    if (method === 'Percentage of Basic' && !percentage) return toast.error('Percentage is required for this category.')
    setBusy(true)
    try {
      const { data } = await deductionsAPI.convertRequest(request.id, {
        category, deduction_date: deductionDate,
        amount: method === 'Fixed Amount' ? Number(amount) : undefined,
        hours: method === 'Hourly Rate' ? Number(hours) : undefined,
        percentage: method === 'Percentage of Basic' ? Number(percentage) : undefined,
      })
      if (data.request.push_status !== 'pushed') {
        toast.error(`Converted, but didn't reach payroll: ${data.request.push_detail || 'unknown error'}`)
      } else {
        toast.success('Deduction created')
      }
      onActioned()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to convert request')
    } finally { setBusy(false) }
  }

  const handleDismiss = async () => {
    if (!note.trim()) return toast.error('A reason is required to dismiss.')
    setBusy(true)
    try {
      await deductionsAPI.dismissRequest(request.id, note)
      toast.success('Request dismissed')
      onActioned()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to dismiss request')
    } finally { setBusy(false) }
  }

  return (
    <BottomSheet open={!!request} onClose={onClose} title="Deduction Request">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{request.employee_display_name}</div>
          <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
            {request.category_hint} · {fmtDate(request.incident_date)} · flagged by {request.requested_by_display_name}
          </div>
        </div>
        <div style={{ fontSize: 13, color: c.textSub, background: c.bg, borderRadius: 8, padding: '10px 12px' }}>
          {request.description}
        </div>
        {(request.suggested_amount || request.suggested_hours) && (
          <div style={{ fontSize: 12, color: c.textMuted }}>
            Supervisor suggested: {request.suggested_amount ? `SAR ${request.suggested_amount}` : ''}
            {request.suggested_amount && request.suggested_hours ? ' · ' : ''}
            {request.suggested_hours ? `${request.suggested_hours}h` : ''}
          </div>
        )}

        {dismissing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              placeholder="Reason for dismissing (required)" value={note} onChange={e => setNote(e.target.value)} rows={3}
              style={S.input}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDismissing(false)} style={S.btn('cancel')}>Back</button>
              <button onClick={handleDismiss} disabled={busy} style={S.btn('reject')}>
                {busy ? 'Dismissing…' : 'Confirm Dismiss'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <label style={S.label}>Deduction Category</label>
              {categories === null ? (
                <div style={{ fontSize: 12, color: c.textMuted, padding: '8px 0' }}>Loading…</div>
              ) : (
                <select value={category} onChange={e => setCategory(e.target.value)} style={S.input}>
                  <option value="" disabled>Select…</option>
                  {categories.map(cat => (
                    <option key={cat.category_code} value={cat.category_code}>{cat.label_en} ({cat.calculation_method})</option>
                  ))}
                </select>
              )}
            </div>

            {method === 'Fixed Amount' && (
              <div>
                <label style={S.label}>Amount (SAR)</label>
                <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={S.input} />
              </div>
            )}
            {method === 'Hourly Rate' && (
              <div>
                <label style={S.label}>Hours</label>
                <input type="number" min="0" step="0.25" value={hours} onChange={e => setHours(e.target.value)} style={S.input} />
              </div>
            )}
            {method === 'Percentage of Basic' && (
              <div>
                <label style={S.label}>Percentage</label>
                <input type="number" min="0" max="100" step="0.5" value={percentage} onChange={e => setPercentage(e.target.value)} style={S.input} />
              </div>
            )}

            <div>
              <label style={S.label}>Deduction Date</label>
              <input type="date" value={deductionDate} max={todayISO()} onChange={e => setDeductionDate(e.target.value)} style={S.input} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDismissing(true)} disabled={busy} style={S.btn('reject')}>
                <Icon name="xCircle" size={14} color={c.red} /> Dismiss
              </button>
              <button onClick={handleConvert} disabled={busy || !category} style={S.btn('approve')}>
                <Icon name="checkCircle" size={14} color="#fff" /> {busy ? 'Creating…' : 'Create Deduction'}
              </button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  )
}

// ── Appeals tab: uphold or overturn an employee's appeal ──

function ResolveAppealSheet({ deduction, onClose, onActioned }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setNotes('') }, [deduction])
  if (!deduction) return null

  const resolve = async (outcome) => {
    setBusy(true)
    try {
      await deductionsAPI.resolveAppeal(deduction.deduction, outcome, notes || undefined)
      toast.success(outcome === 'Upheld' ? 'Appeal upheld - deduction stands' : 'Appeal overturned - deduction cancelled')
      onActioned()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to resolve appeal')
    } finally { setBusy(false) }
  }

  return (
    <BottomSheet open={!!deduction} onClose={onClose} title="Resolve Appeal">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{deduction.employee}</div>
          <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
            {deduction.category} · {fmtDate(deduction.deduction_date)} · SAR {deduction.amount}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Reason for deduction</div>
          <div style={{ fontSize: 13, color: c.textSub, background: c.bg, borderRadius: 8, padding: '10px 12px' }}>{deduction.reason}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Employee's appeal</div>
          <div style={{ fontSize: 13, color: c.textSub, background: c.orangeBg, border: `1px solid ${c.orangeBorder}`, borderRadius: 8, padding: '10px 12px' }}>
            {deduction.appeal_reason}
          </div>
        </div>
        <div>
          <label style={S.label}>Resolution Notes <span style={{ fontWeight: 400, textTransform: 'none', color: c.textMuted }}>(optional)</span></label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={S.input} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => resolve('Overturned')} disabled={busy} style={S.btn('reject')}>
            <Icon name="xCircle" size={14} color={c.red} /> Overturn
          </button>
          <button onClick={() => resolve('Upheld')} disabled={busy} style={S.btn('approve')}>
            <Icon name="checkCircle" size={14} color="#fff" /> Uphold
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

export default function DeductionsReviewPage() {
  const isMobile = useIsMobile()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') === 'appeals' ? 'appeals' : 'requests')

  const [requests, setRequests] = useState(null)
  const [appeals, setAppeals] = useState(null)
  const [openRequest, setOpenRequest] = useState(null)
  const [openAppeal, setOpenAppeal] = useState(null)

  const loadRequests = useCallback(async () => {
    try {
      const { data } = await deductionsAPI.pendingRequests()
      setRequests(data.requests)
    } catch { toast.error('Failed to load pending requests'); setRequests([]) }
  }, [])

  const loadAppeals = useCallback(async () => {
    try {
      const { data } = await deductionsAPI.pendingAppeals()
      setAppeals(data.deductions)
    } catch { toast.error('Failed to load pending appeals'); setAppeals([]) }
  }, [])

  useEffect(() => { loadRequests(); loadAppeals() }, [loadRequests, loadAppeals])

  const handleTabChange = (key) => { setTab(key); setSearchParams({ tab: key }) }

  const body = (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['requests', `Requests${requests?.length ? ` (${requests.length})` : ''}`], ['appeals', `Appeals${appeals?.length ? ` (${appeals.length})` : ''}`]].map(([key, label]) => (
          <button key={key} onClick={() => handleTabChange(key)} style={{
            flex: 1, textAlign: 'center', padding: '10px 0', cursor: 'pointer',
            background: tab === key ? c.primaryDark : '#fff', borderRadius: 10, fontSize: 13, fontWeight: 700,
            color: tab === key ? '#fff' : c.textSub, border: `1px solid ${tab === key ? c.primaryDark : c.border}`,
            fontFamily: c.font,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {tab === 'requests' ? (
          requests === null ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
          ) : requests.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Nothing pending</div>
          ) : requests.map(req => (
            <button key={req.id} onClick={() => setOpenRequest(req)} style={S.row}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="dollarSign" size={15} color={c.textSub} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{req.employee_display_name}</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 1 }}>{req.category_hint} · {fmtDate(req.incident_date)}</div>
              </div>
              <Icon name="chevronRight" size={14} color={c.textMuted} />
            </button>
          ))
        ) : (
          appeals === null ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
          ) : appeals.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>No pending appeals</div>
          ) : appeals.map(ded => (
            <button key={ded.deduction} onClick={() => setOpenAppeal(ded)} style={S.row}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: c.orangeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="alertCircle" size={15} color={c.orange} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{ded.employee}</div>
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 1 }}>{ded.category} · SAR {ded.amount}</div>
              </div>
              <Icon name="chevronRight" size={14} color={c.textMuted} />
            </button>
          ))
        )}
      </div>
    </div>
  )

  const sheets = (
    <>
      <ConvertRequestSheet request={openRequest} onClose={() => setOpenRequest(null)} onActioned={loadRequests} />
      <ResolveAppealSheet deduction={openAppeal} onClose={() => setOpenAppeal(null)} onActioned={loadAppeals} />
    </>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Deductions" />
        <div style={{ padding: '20px 16px 40px' }}>{body}</div>
        {sheets}
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Deductions</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>Review supervisor requests and employee appeals.</p>
      </div>
      {body}
      {sheets}
    </div>
  )
}

const S = {
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: c.textSub, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 7 },
  input: { width: '100%', padding: '10px 14px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 14, color: c.text, background: c.surfaceRaised, fontFamily: c.font, boxSizing: 'border-box', resize: 'vertical' },
  row: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    padding: '12px 16px', background: 'none', border: 'none',
    borderBottom: `1px solid ${c.bg}`, cursor: 'pointer', textAlign: 'left', fontFamily: c.font,
  },
  btn: (kind) => {
    const base = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: c.font, border: 'none' }
    if (kind === 'approve') return { ...base, background: c.green, color: '#fff' }
    if (kind === 'reject') return { ...base, background: c.redBg, color: c.red, border: `1px solid ${c.redBorder}` }
    return { ...base, background: c.surface, color: c.textSub, border: `1px solid ${c.border}` }
  },
}
