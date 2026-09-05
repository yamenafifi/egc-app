// Accountant's Expense Claim review - desktop only (reviewing receipts
// against the source PDF genuinely needs real screen space). The desktop
// experience itself lives in pages/desktop/ExpenseClaimsReviewPage.jsx -
// a real table + a wide review drawer, not a reskinned mobile page.
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { lazy } from 'react'
const DesktopExpenseClaimsReviewPage = lazy(() => import('@/pages/desktop/ExpenseClaimsReviewPage')) // see App.jsx's top comment - split out of the initial bundle

export default function ExpenseClaimsReviewPage() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font, display: 'flex', flexDirection: 'column' }}>
        <PageTopBar title="Expense Claims" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
          <Icon name="monitor" size={40} color={c.borderStrong} />
          <div style={{ fontSize: 16, fontWeight: 700, color: c.text }}>Desktop Only</div>
          <div style={{ fontSize: 13, color: c.textMuted, maxWidth: 280 }}>
            Reviewing receipts against the source PDF needs a larger screen. Please open this page on a desktop.
          </div>
        </div>
      </div>
    )
  }

  return <DesktopExpenseClaimsReviewPage />
}
