// The employee-facing (and reviewer-readable) single-claim detail page -
// this is what every expense-claim notification link lands on. Desktop
// rendering is pages/desktop/ExpenseClaimDetailPage.jsx - the "Job" status
// panel and timeline the user asked for, in the new design system.
import { useState, useEffect, useCallback, lazy } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { LoadingBlock, EmptyState } from '@/components/Shared'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useExpenseClaimPolling } from '@/hooks/useExpenseClaimPolling'
import { expenseClaimsAPI } from '@/services/api'
import { statusBadge, fmtClaimDate } from '@/utils/expenseClaims'
import JobStatusPanel from '@/components/expenseClaims/JobStatusPanel'
const DesktopExpenseClaimDetailPage = lazy(() => import('@/pages/desktop/ExpenseClaimDetailPage')) // see App.jsx's top comment - split out of the initial bundle

function TimelineStep({ label, state, note }) {
  const color = state === 'done' ? c.green : state === 'active' ? c.blue : c.borderStrong
  const bg = state === 'done' ? c.greenBg : state === 'active' ? c.blueBg : c.bg
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        background: bg, border: `1.5px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {state === 'done' && <Icon name="check" size={11} color={color} />}
      </div>
      <div style={{ paddingBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: state === 'pending' ? c.textMuted : c.text }}>{label}</div>
        {note && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  )
}

function Timeline({ app }) {
  const status = app.status
  const rank = { submitted: 0, processing: 0, extracted: 1, accountant_approved: 2, approved: 3 }[status] ?? 0
  return (
    <div style={{ marginTop: 4 }}>
      <TimelineStep label="Submitted" state="done" note={fmtClaimDate(app.submitted_at)} />
      <TimelineStep
        label="Extraction & Accountant Review"
        state={rank > 1 ? 'done' : rank === 1 || status === 'processing' ? 'active' : 'pending'}
        note={app.accountant_reviewed_by_name ? `Reviewed by ${app.accountant_reviewed_by_name}` : undefined}
      />
      <TimelineStep
        label="Final Approval"
        state={rank > 2 ? 'done' : rank === 2 ? 'active' : 'pending'}
        note={app.final_reviewed_by_name ? `Reviewed by ${app.final_reviewed_by_name}` : undefined}
      />
      <TimelineStep
        label="Approved"
        state={status === 'approved' ? 'done' : 'pending'}
        note={status === 'approved' && app.push_status === 'pushed' ? 'Posted to ERPNext' : undefined}
      />
    </div>
  )
}

function MobileExpenseClaimDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [application, setApplication] = useState(undefined)
  const [error, setError] = useState(null)
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await expenseClaimsAPI.get(id)
      setApplication(data.application)
    } catch (e) {
      setApplication(null)
      setError(e.response?.data?.error || 'Failed to load this expense claim.')
    }
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

  let body
  if (application === undefined) {
    body = <LoadingBlock text="Loading claim…" />
  } else if (application === null) {
    body = <EmptyState icon="alertCircle" title="Can't open this claim" sub={error} />
  } else {
    const badge = statusBadge(application.status)
    const includedReceipts = (application.receipts || []).filter(r => r.included)

    body = (
      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: c.text }}>
              {application.total_claimed_amount ? `SAR ${application.total_claimed_amount}` : application.source_pdf_filename}
            </div>
            <div style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>
              {application.project_name || application.project_id} · {fmtClaimDate(application.submitted_at)}
            </div>
          </div>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap',
          }}>{badge.label}</span>
        </div>

        {application.created_by_display_name && (
          <div style={{ fontSize: 11, color: c.textMuted, marginTop: 6 }}>
            Submitted by {application.created_by_display_name} on your behalf
          </div>
        )}

        {application.purpose && (
          <div style={{ fontSize: 13, color: c.textSub, marginTop: 12, background: c.bg, borderRadius: 8, padding: '10px 12px' }}>
            {application.purpose}
          </div>
        )}

        {application.rejection_reason && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', background: c.redBg, border: `1px solid ${c.redBorder}`, borderRadius: 8 }}>
            <Icon name="alertCircle" size={14} color={c.red} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: c.red }}>Sent back for correction</div>
              <div style={{ fontSize: 12, color: c.textSub, marginTop: 2 }}>{application.rejection_reason}</div>
            </div>
          </div>
        )}

        {application.status === 'approved' && application.push_status !== 'pushed' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, padding: '10px 12px', background: c.orangeBg, border: `1px solid ${c.orangeBorder}`, borderRadius: 8 }}>
            <Icon name="alertCircle" size={14} color={c.orange} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: c.textSub }}>
              Approved, but hasn't reached accounting yet ({application.push_detail || 'unknown error'}). HR has been notified.
            </span>
          </div>
        )}

        <JobStatusPanel application={application} style={{ marginTop: 12 }} />

        <div style={{ fontSize: 12, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', margin: '20px 0 12px' }}>
          Status
        </div>
        <Timeline app={application} />

        {includedReceipts.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px', margin: '4px 0 12px' }}>
              {includedReceipts.length} Receipt{includedReceipts.length !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {includedReceipts.map((r, i) => (
                <div key={i} style={{ padding: '10px 12px', background: c.surfaceRaised, border: `1px solid ${c.border}`, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: c.text }}>
                    <span>{r.vendor_name || 'Unknown vendor'}</span>
                    <span>{r.total_amount != null ? `SAR ${r.total_amount}` : '—'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 3 }}>
                    {r.receipt_date ? fmtClaimDate(r.receipt_date) : 'Date unknown'}
                    {r.description_en ? ` · ${r.description_en}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <button onClick={async () => {
          try {
            const { data } = await expenseClaimsAPI.sourcePdf(application.id)
            window.open(URL.createObjectURL(data), '_blank')
          } catch { toast.error('Failed to load the receipts PDF') }
        }} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
          padding: '11px', marginTop: 18, borderRadius: 9, border: `1px solid ${c.border}`,
          background: c.surface, color: c.textSub, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: c.font,
        }}>
          <Icon name="fileText" size={14} color={c.textSub} /> View Receipts PDF
        </button>

        {(application.status === 'submitted' || application.status === 'processing') && (
          confirmingWithdraw ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => setConfirmingWithdraw(false)} style={{
                flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${c.border}`,
                background: c.surface, color: c.textSub, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: c.font,
              }}>Cancel</button>
              <button onClick={withdraw} disabled={withdrawing} style={{
                flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${c.redBorder}`,
                background: c.redBg, color: c.red, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: c.font,
              }}>{withdrawing ? 'Withdrawing…' : 'Confirm Withdraw'}</button>
            </div>
          ) : (
            <button onClick={() => setConfirmingWithdraw(true)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
              padding: '11px', marginTop: 10, borderRadius: 9, border: `1px solid ${c.redBorder}`,
              background: c.surface, color: c.red, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: c.font,
            }}>
              <Icon name="xCircle" size={14} color={c.red} /> Withdraw Claim
            </button>
          )
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
      <PageTopBar title="Expense Claim" onBack={() => navigate('/expense-claims/mine')} />
      <div style={{ padding: '20px 16px 40px' }}>{body}</div>
    </div>
  )
}

export default function ExpenseClaimDetailPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileExpenseClaimDetailPage /> : <DesktopExpenseClaimDetailPage />
}
