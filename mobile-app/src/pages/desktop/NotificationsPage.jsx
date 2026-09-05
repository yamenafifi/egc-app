import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { notificationsAPI } from '@/services/api'
import { registerPush, unregisterPush, getPushSubscriptionState } from '@/services/push'
import { PageHeader, SecondaryButton } from '@/desktop/components/Page'
import Badge from '@/desktop/components/Badge'

const TYPE_ICON = {
  leave_submitted: 'calendar', leave_approved: 'calendar', leave_rejected: 'calendar',
  timesheet_submitted: 'clock', timesheet_supervisor_approved: 'clock',
  timesheet_ready_for_final_approval: 'checkCircle',
  timesheet_approved: 'clock', timesheet_rejected: 'clock',
  timesheet_push_failed: 'alertCircle',
  expense_claim_submitted: 'creditCard', expense_claim_ready_for_final_approval: 'creditCard',
  expense_claim_rejected: 'alertCircle', expense_claim_final_rejected: 'alertCircle',
  expense_claim_approved: 'checkCircle', expense_claim_push_failed: 'alertCircle',
  expense_claim_extraction_completed: 'checkCircle', expense_claim_extraction_failed: 'alertCircle',
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffMin < 24 * 60) return `${Math.round(diffMin / 60)}h ago`
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { refresh: refreshUnread } = useUnreadCount()

  const [items, setItems] = useState(null)
  const [pushState, setPushState] = useState('checking')
  const [pushBusy, setPushBusy] = useState(false)

  const load = useCallback(async () => {
    try { const { data } = await notificationsAPI.list({ page_length: 50 }); setItems(data.notifications) }
    catch { setItems([]) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { getPushSubscriptionState().then(setPushState) }, [])

  const handleOpen = async (n) => {
    if (!n.is_read) {
      try { await notificationsAPI.markRead(n.id) } catch { /* non-fatal, list still updates optimistically */ }
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      refreshUnread()
    }
    if (n.link) navigate(n.link)
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead()
      setItems(prev => prev.map(x => ({ ...x, is_read: true })))
      refreshUnread()
    } catch { toast.error('Failed to mark all as read') }
  }

  const handleTogglePush = async () => {
    setPushBusy(true)
    try {
      if (pushState === 'on') { await unregisterPush(); setPushState('off'); toast.success('Push notifications turned off') }
      else { await registerPush(); setPushState('on'); toast.success('Push notifications enabled') }
    } catch (e) { toast.error(e.message || 'Could not update push notification settings') }
    finally { setPushBusy(false) }
  }

  const hasUnread = items?.some(n => !n.is_read)

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Notifications"
        action={hasUnread && <SecondaryButton onClick={handleMarkAllRead}>Mark all as read</SecondaryButton>}
      />

      {pushState === 'off' && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200 mb-4">
          <Icon name="bell" size={16} className="text-blue-600 shrink-0" />
          <div className="flex-1 text-xs text-slate-600">Get notified instantly, even when the app is closed.</div>
          <SecondaryButton onClick={handleTogglePush} disabled={pushBusy}>{pushBusy ? 'Enabling…' : 'Enable'}</SecondaryButton>
        </div>
      )}
      {pushState === 'on' && (
        <div className="mb-4">
          <Badge tone="green">Push notifications on</Badge>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white shadow-card overflow-hidden">
        {items === null ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No notifications yet</div>
        ) : (
          <div className="flex flex-col">
            {items.map(n => (
              <button
                key={n.id}
                onClick={() => handleOpen(n)}
                className={`flex items-start gap-3 w-full px-4 py-3 text-left border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${n.is_read ? '' : 'bg-blue-50/40'}`}
              >
                <div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name={TYPE_ICON[n.type] || 'bell'} size={14} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[13px] ${n.is_read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{n.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.body}</div>
                  <div className="text-[11px] text-slate-400 mt-1">{fmtTime(n.created_at)}</div>
                </div>
                {!n.is_read && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
