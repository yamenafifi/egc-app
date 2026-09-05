import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import { PageWrap, PageHeader, Card, EmptyState } from '@/components/Shared'
import { useIsMobile } from '@/hooks/useIsMobile'
import { lazy } from 'react'
const DesktopSystemSettingsPage = lazy(() => import('@/pages/desktop/SystemSettingsPage')) // see App.jsx's top comment - split out of the initial bundle

// This page used to host a single toggle switching attendance between
// QR-code scanning and manual timesheet entry - both paradigms were
// replaced by the current GPS/site-based clock-in flow (see
// components/attendance/CheckInSheet.jsx) and no code path reads that
// flag any more. Kept as a real page (not deleted outright) since the
// backend /api/settings GET/PUT scaffold (server/app/api/settings.py) is
// a generic, reusable settings store - this is where a genuinely new
// system-wide setting belongs once one exists.
function MobileSystemSettingsPage() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('system.manage_settings')

  return (
    <PageWrap>
      <PageHeader title="System Settings" sub="Configure system-wide behaviour for all users." />

      <Card>
        <EmptyState
          icon="settings"
          title="No configurable settings yet"
          sub="System-wide settings will appear here once one is added."
        />
      </Card>

      {!canEdit && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 16,
          padding: '12px 16px', background: c.orangeBg,
          border: `1px solid ${c.orangeBorder}`, borderRadius: 8,
          fontSize: 13, color: c.textSub,
        }}>
          <Icon name="alertCircle" size={15} color={c.orange} />
          You have view-only access to system settings.
        </div>
      )}
    </PageWrap>
  )
}

export default function SystemSettingsPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileSystemSettingsPage /> : <DesktopSystemSettingsPage />
}
