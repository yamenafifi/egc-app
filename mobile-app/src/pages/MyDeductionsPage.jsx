import { useState, useEffect, useCallback, lazy } from 'react'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import BottomSheet from '@/components/ui/BottomSheet'
import { useIsMobile } from '@/hooks/useIsMobile'
import { deductionsAPI } from '@/services/api'
const DesktopMyDeductionsPage = lazy(() => import('@/pages/desktop/MyDeductionsPage')) // see App.jsx's top comment - split out of the initial bundle

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const APPEAL_BADGE = {
  Pending: { bg: c.orangeBg, color: c.orange, border: c.orangeBorder, label: 'Appeal Pending' },
  Upheld: { bg: c.redBg, color: c.red, border: c.redBorder, label: 'Appeal Upheld' },
  Overturned: { bg: c.greenBg, color: c.green, border: c.greenBorder, label: 'Appeal Overturned' },
}

function AppealSheet({ deduction, onClose, onActioned }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { setReason('') }, [deduction])
  if (!deduction) return null

  const submit = async () => {
    if (!reason.trim()) return toast.error('Explain why you\'re appealing this.')
    setBusy(true)
    try {
      await deductionsAPI.appeal(deduction.deduction, reason)
      toast.success('Appeal submitted to HR')
      onActioned()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit appeal')
    } finally { setBusy(false) }
  }

  return (
    <BottomSheet open={!!deduction} onClose={onClose} title="Appeal Deduction">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, color: c.textSub, background: c.bg, borderRadius: 8, padding: '10px 12px' }}>
          {deduction.reason}
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: c.textSub, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 7 }}>
            Why are you appealing this?
          </label>
          <textarea
            autoFocus value={reason} onChange={e => setReason(e.target.value)} rows={4}
            placeholder="Explain what happened from your side - HR will review this."
            style={{ width: '100%', padding: '10px 14px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 14, fontFamily: c.font, resize: 'vertical', boxSizing: 'border-box' }}
          />
        </div>
        <button onClick={submit} disabled={busy} style={{
          width: '100%', padding: '12px', borderRadius: 9, border: 'none',
          background: c.primaryDark, color: '#fff', fontFamily: c.font, fontSize: 13, fontWeight: 700,
          cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
        }}>
          {busy ? 'Submitting…' : 'Submit Appeal'}
        </button>
      </div>
    </BottomSheet>
  )
}

function MobileMyDeductionsPage() {
  const [deductions, setDeductions] = useState(null)
  const [appealing, setAppealing] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await deductionsAPI.mine()
      setDeductions(data.deductions)
    } catch {
      toast.error('Failed to load your deductions')
      setDeductions([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const body = (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {deductions === null ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
        ) : deductions.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>No deductions on record</div>
        ) : deductions.map(ded => {
          const badge = ded.appeal_status ? APPEAL_BADGE[ded.appeal_status] : null
          const canAppeal = !ded.appeal_status
          return (
            <div key={ded.deduction} style={{ padding: '14px 16px', borderBottom: `1px solid ${c.bg}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>SAR {ded.amount}</div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{ded.category} · {fmtDate(ded.deduction_date)}</div>
                </div>
                {badge && (
                  <span style={{
                    display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                    background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap',
                  }}>{badge.label}</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: c.textSub, marginTop: 6 }}>{ded.reason}</div>
              {ded.appeal_status === 'Pending' && ded.appeal_reason && (
                <div style={{ fontSize: 11, color: c.orange, marginTop: 6, fontStyle: 'italic' }}>Your appeal: "{ded.appeal_reason}"</div>
              )}
              {ded.appeal_resolution_notes && (
                <div style={{ fontSize: 11, color: c.textMuted, marginTop: 6 }}>HR: {ded.appeal_resolution_notes}</div>
              )}
              {canAppeal && (
                <button onClick={() => setAppealing(ded)} style={{
                  marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
                  border: `1px solid ${c.border}`, background: c.surface, color: c.textSub, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: c.font,
                }}>
                  <Icon name="alertCircle" size={12} color={c.textSub} /> Appeal
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
      <PageTopBar title="My Deductions" />
      <div style={{ padding: '20px 16px 40px' }}>{body}</div>
      <AppealSheet deduction={appealing} onClose={() => setAppealing(null)} onActioned={load} />
    </div>
  )
}

export default function MyDeductionsPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileMyDeductionsPage /> : <DesktopMyDeductionsPage />
}
