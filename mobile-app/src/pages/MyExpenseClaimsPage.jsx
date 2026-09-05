import { useState, useEffect, useCallback, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { expenseClaimsAPI } from '@/services/api'
import { statusBadge, fmtClaimDate as fmtDate } from '@/utils/expenseClaims'
const DesktopMyExpenseClaimsPage = lazy(() => import('@/pages/desktop/MyExpenseClaimsPage')) // see App.jsx's top comment - split out of the initial bundle

function MobileMyExpenseClaimsPage() {
  const navigate = useNavigate()
  const [applications, setApplications] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await expenseClaimsAPI.mine()
      setApplications(data.applications)
    } catch {
      toast.error('Failed to load your expense claims')
      setApplications([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const body = (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {applications === null ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
        ) : applications.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>No expense claims yet</div>
        ) : applications.map(app => {
          const badge = statusBadge(app.status)
          return (
            <button key={app.id} onClick={() => navigate(`/expense-claims/${app.id}`)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '14px 16px',
              background: 'none', border: 'none', borderBottom: `1px solid ${c.bg}`,
              cursor: 'pointer', fontFamily: c.font,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: c.text }}>
                    {app.total_claimed_amount ? `SAR ${app.total_claimed_amount}` : app.source_pdf_filename}
                  </div>
                  <div style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
                    {app.project_name || app.project_id} · {fmtDate(app.submitted_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                    background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, whiteSpace: 'nowrap',
                  }}>{badge.label}</span>
                  <Icon name="chevronRight" size={14} color={c.textMuted} />
                </div>
              </div>
              {app.purpose && <div style={{ fontSize: 12, color: c.textSub, marginTop: 6 }}>{app.purpose}</div>}
              {app.rejection_reason && (
                <div style={{ fontSize: 11, color: c.red, marginTop: 6, fontStyle: 'italic' }}>{app.rejection_reason}</div>
              )}
              {app.status === 'approved' && app.push_status !== 'pushed' && (
                <div style={{ fontSize: 11, color: c.orange, marginTop: 6 }}>
                  Approved, but hasn't reached accounting yet - HR has been notified.
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
      <PageTopBar title="My Expense Claims" />
      <div style={{ padding: '20px 16px 40px' }}>{body}</div>
    </div>
  )
}

export default function MyExpenseClaimsPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileMyExpenseClaimsPage /> : <DesktopMyExpenseClaimsPage />
}
