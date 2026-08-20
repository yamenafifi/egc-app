import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { leaveAPI } from '@/services/api'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function LeaveRequestPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [types, setTypes] = useState([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [form, setForm] = useState({ leave_type: '', from_date: todayISO(), to_date: todayISO(), reason: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    leaveAPI.types()
      .then(({ data }) => setTypes(data.leave_types || []))
      .catch(() => toast.error('Failed to load leave types'))
      .finally(() => setLoadingTypes(false))
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.leave_type) return toast.error('Select a leave type.')
    if (form.to_date < form.from_date) return toast.error('End date must be on or after the start date.')
    setSubmitting(true)
    try {
      await leaveAPI.create(form)
      toast.success('Leave request submitted')
      navigate('/leaves')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit leave request')
    } finally {
      setSubmitting(false)
    }
  }

  const form_ = (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
      <div>
        <label style={S.label}>Leave Type</label>
        {loadingTypes ? (
          <div style={{ fontSize: 13, color: c.textMuted, padding: '8px 0' }}>Loading…</div>
        ) : (
          <select
            required value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
            style={S.input}
          >
            <option value="" disabled>Select leave type…</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>From</label>
          <input
            type="date" required value={form.from_date}
            onChange={e => setForm(f => ({ ...f, from_date: e.target.value }))}
            style={S.input}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={S.label}>To</label>
          <input
            type="date" required value={form.to_date} min={form.from_date}
            onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))}
            style={S.input}
          />
        </div>
      </div>

      <div>
        <label style={S.label}>Reason <span style={{ fontWeight: 400, textTransform: 'none', color: c.textMuted }}>(optional)</span></label>
        <textarea
          rows={4} value={form.reason} placeholder="Add any context for your approver…"
          onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
          style={{ ...S.input, resize: 'vertical' }}
        />
      </div>

      <button type="submit" disabled={submitting} style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Submit Request'} <Icon name="arrowRight" size={14} color="#fff" />
      </button>
    </form>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Request Leave" />
        <div style={{ padding: '20px 16px 40px' }}>{form_}</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Request Leave</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>Submit a leave application for your approver's review.</p>
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
