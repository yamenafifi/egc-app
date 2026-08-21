import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { deductionsAPI } from '@/services/api'
import { CATEGORY_HINTS } from '@/utils/deductions'

const todayISO = () => new Date().toISOString().slice(0, 10)

function EmployeePicker({ value, onSelect }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const t = setTimeout(() => {
      deductionsAPI.searchEmployees(search)
        .then(({ data }) => setResults(data.employees || []))
        .catch(() => toast.error('Failed to search employees'))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [search, open])

  if (value && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        padding: '10px 14px', border: `1.5px solid ${c.border}`, borderRadius: 8,
        background: c.surfaceRaised, fontFamily: c.font, cursor: 'pointer', boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: 14, color: c.text, fontWeight: 600 }}>{value.employee_name}</span>
        <Icon name="edit" size={13} color={c.textMuted} />
      </button>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Icon name="search" size={14} color={c.textMuted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          autoFocus={open} value={search} onFocus={() => setOpen(true)}
          onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
          style={{ width: '100%', padding: '10px 14px 10px 36px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 14, fontFamily: c.font, boxSizing: 'border-box' }}
        />
      </div>
      {open && (
        <div style={{
          marginTop: 6, border: `1px solid ${c.border}`, borderRadius: 8, background: c.surfaceRaised,
          maxHeight: 220, overflowY: 'auto',
        }}>
          {loading ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: c.textMuted }}>Searching…</div>
          ) : results.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12, color: c.textMuted }}>No employees found.</div>
          ) : results.map(emp => (
            <button key={emp.name} type="button" onClick={() => { onSelect(emp); setOpen(false); setSearch('') }} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none',
              border: 'none', borderBottom: `1px solid ${c.bg}`, cursor: 'pointer', fontFamily: c.font,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{emp.employee_name}</div>
              <div style={{ fontSize: 11, color: c.textMuted }}>{emp.designation || emp.department || emp.name}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DeductionRequestPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [employee, setEmployee] = useState(null)
  const [form, setForm] = useState({
    category_hint: '', description: '', incident_date: todayISO(),
    suggested_amount: '', suggested_hours: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!employee) return toast.error('Select the employee this is about.')
    if (!form.category_hint) return toast.error('Select what kind of incident this is.')
    if (!form.description.trim()) return toast.error('Describe what happened.')
    setSubmitting(true)
    try {
      await deductionsAPI.createRequest({
        employee_erp_id: employee.name,
        category_hint: form.category_hint,
        description: form.description,
        incident_date: new Date(form.incident_date).toISOString(),
        suggested_amount: form.suggested_amount ? Number(form.suggested_amount) : undefined,
        suggested_hours: form.suggested_hours ? Number(form.suggested_hours) : undefined,
      })
      toast.success('Deduction Request sent to HR')
      navigate('/home')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const form_ = (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
      <div>
        <label style={S.label}>Employee</label>
        <EmployeePicker value={employee} onSelect={setEmployee} />
      </div>

      <div>
        <label style={S.label}>Type</label>
        <select
          required value={form.category_hint} onChange={e => setForm(f => ({ ...f, category_hint: e.target.value }))}
          style={S.input}
        >
          <option value="" disabled>Select…</option>
          {CATEGORY_HINTS.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>

      <div>
        <label style={S.label}>What happened</label>
        <textarea
          required rows={4} value={form.description} placeholder="Describe the incident - HR will review this before anything is deducted."
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          style={{ ...S.input, resize: 'vertical' }}
        />
      </div>

      <div>
        <label style={S.label}>Date</label>
        <input
          type="date" required value={form.incident_date} max={todayISO()}
          onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))}
          style={S.input}
        />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Suggested Amount <span style={{ fontWeight: 400, textTransform: 'none', color: c.textMuted }}>(optional)</span></label>
          <input
            type="number" min="0" step="0.01" value={form.suggested_amount}
            onChange={e => setForm(f => ({ ...f, suggested_amount: e.target.value }))}
            placeholder="SAR" style={S.input}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>Hours <span style={{ fontWeight: 400, textTransform: 'none', color: c.textMuted }}>(optional)</span></label>
          <input
            type="number" min="0" step="0.25" value={form.suggested_hours}
            onChange={e => setForm(f => ({ ...f, suggested_hours: e.target.value }))}
            style={S.input}
          />
        </div>
      </div>
      <div style={{ fontSize: 11, color: c.textMuted, marginTop: -8 }}>
        Final amount and category are decided by HR - your suggestion is only a starting point.
      </div>

      <button type="submit" disabled={submitting} style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Sending…' : 'Send to HR'} <Icon name="arrowRight" size={14} color="#fff" />
      </button>
    </form>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Flag a Deduction" />
        <div style={{ padding: '20px 16px 40px' }}>{form_}</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Flag a Deduction</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>
          Report equipment damage or unproductive hours for HR to review. Traffic violations are handled separately by HR.
        </p>
      </div>
      <div style={{ background: c.surface, borderRadius: 14, border: `1px solid ${c.border}`, padding: 24 }}>
        {form_}
      </div>
    </div>
  )
}

const S = {
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: c.textSub, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 7 },
  input: { width: '100%', padding: '10px 14px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 14, color: c.text, background: c.surfaceRaised, fontFamily: c.font, boxSizing: 'border-box' },
  submitBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: c.primaryDark, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: c.font, marginTop: 4 },
}
