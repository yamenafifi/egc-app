// Receipt search across every expense claim - desktop only, same
// reasoning as ExpenseClaimsReviewPage.jsx: cross-referencing a table of
// receipts against PDFs and line items needs real screen space.
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { lazy } from 'react'
const DesktopReceiptsSearchPage = lazy(() => import('@/pages/desktop/ReceiptsSearchPage')) // see App.jsx's top comment - split out of the initial bundle

export default function ExpenseClaimReceiptsPage() {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font, display: 'flex', flexDirection: 'column' }}>
        <PageTopBar title="Receipts" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
          <Icon name="monitor" size={40} color={c.borderStrong} />
          <div style={{ fontSize: 16, fontWeight: 700, color: c.text }}>Desktop Only</div>
          <div style={{ fontSize: 13, color: c.textMuted, maxWidth: 280 }}>
            Searching receipts against PDFs and line items needs a larger screen. Please open this page on a desktop.
          </div>
        </div>
      </div>
    )
  }

  return <DesktopReceiptsSearchPage />
}
