import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { expenseClaimsAPI, attendanceAPI } from '@/services/api'

export default function ExpenseClaimRequestPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [sites, setSites] = useState(null)
  const [projectId, setProjectId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    attendanceAPI.sites()
      .then(({ data }) => setSites(data.sites || []))
      .catch(() => { toast.error('Failed to load projects'); setSites([]) })
  }, [])

  const handleFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.type !== 'application/pdf') {
      toast.error('Please choose a PDF file.')
      return
    }
    if (f.size > 45 * 1024 * 1024) {
      toast.error('File is too large (45MB limit).')
      return
    }
    setFile(f)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!projectId) return toast.error('Select the project these expenses are for.')
    if (!file) return toast.error('Attach a PDF of your receipts.')
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      formData.append('project_id', projectId)
      formData.append('purpose', purpose)
      await expenseClaimsAPI.submit(formData)
      toast.success('Expense claim submitted')
      navigate('/expense-claims/mine')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit expense claim')
    } finally {
      setSubmitting(false)
    }
  }

  const form_ = (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
      <div>
        <label style={S.label}>Project</label>
        <select
          required value={projectId} onChange={e => setProjectId(e.target.value)} style={S.input}
          disabled={sites === null}
        >
          <option value="" disabled>{sites === null ? 'Loading…' : 'Select…'}</option>
          {(sites || []).map(s => <option key={s.name} value={s.name}>{s.project_name || s.name}</option>)}
        </select>
      </div>

      <div>
        <label style={S.label}>Purpose <span style={{ fontWeight: 400, textTransform: 'none', color: c.textMuted }}>(optional)</span></label>
        <textarea
          rows={3} value={purpose} placeholder="What were these expenses for?"
          onChange={e => setPurpose(e.target.value)}
          style={{ ...S.input, resize: 'vertical' }}
        />
      </div>

      <div>
        <label style={S.label}>Receipts (PDF)</label>
        <label style={S.fileDrop}>
          <Icon name="upload" size={20} color={c.textMuted} />
          <span style={{ fontSize: 13, fontWeight: 600, color: c.textSub, marginTop: 6 }}>
            {file ? file.name : 'Tap to choose a PDF'}
          </span>
          <span style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
            All receipts in one file - a receipt can span multiple pages
          </span>
          <input type="file" accept="application/pdf" onChange={handleFile} style={{ display: 'none' }} />
        </label>
      </div>

      <button type="submit" disabled={submitting} style={{ ...S.submitBtn, opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Submitting…' : 'Submit Expense Claim'} <Icon name="arrowRight" size={14} color="#fff" />
      </button>
    </form>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Expense Claim" />
        <div style={{ padding: '20px 16px 40px' }}>{form_}</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Expense Claim</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>
          Upload a PDF of your receipts - an Accountant will process and review them before final approval.
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
  fileDrop: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '24px 16px', border: `1.5px dashed ${c.border}`, borderRadius: 10,
    background: c.surfaceRaised, cursor: 'pointer', textAlign: 'center',
  },
  submitBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px', background: c.primaryDark, color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: c.font, marginTop: 4 },
}
