import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useUnreadCount } from '@/hooks/useUnreadCount'
import { notificationsAPI } from '@/services/api'
import { registerPush, unregisterPush, getPushSubscriptionState } from '@/services/push'

const TYPE_ICON = {
  leave_submitted: 'calendar', leave_approved: 'calendar', leave_rejected: 'calendar',
  timesheet_submitted: 'clock', timesheet_approved: 'clock', timesheet_rejected: 'clock',
  timesheet_push_failed: 'alertCircle',
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
  const isMobile = useIsMobile()
  const { refresh: refreshUnread } = useUnreadCount()

  const [items, setItems] = useState(null)
  const [pushState, setPushState] = useState('checking') // checking | unsupported | off | on
  const [pushBusy, setPushBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await notificationsAPI.list({ page_length: 50 })
      setItems(data.notifications)
    } catch {
      setItems([])
    }
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
    } catch {
      toast.error('Failed to mark all as read')
    }
  }

  const handleTogglePush = async () => {
    setPushBusy(true)
    try {
      if (pushState === 'on') {
        await unregisterPush()
        setPushState('off')
        toast.success('Push notifications turned off')
      } else {
        await registerPush()
        setPushState('on')
        toast.success('Push notifications enabled')
      }
    } catch (e) {
      toast.error(e.message || 'Could not update push notification settings')
    } finally {
      setPushBusy(false)
    }
  }

  const hasUnread = items?.some(n => !n.is_read)

  const pushBanner = pushState === 'off' && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: c.blueBg, border: `1px solid ${c.blueBorder}`, borderRadius: 10, marginBottom: 16 }}>
      <Icon name="bell" size={16} color={c.blue} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 12, color: c.textSub }}>Get notified instantly, even when the app is closed.</div>
      <button onClick={handleTogglePush} disabled={pushBusy} style={{
        flexShrink: 0, padding: '7px 12px', borderRadius: 7, border: 'none',
        background: c.blue, color: '#fff', fontFamily: c.font, fontSize: 11, fontWeight: 700, cursor: 'pointer',
      }}>
        {pushBusy ? 'Enabling…' : 'Enable'}
      </button>
    </div>
  )

  const body = (
    <div style={{ maxWidth: 640 }}>
      {pushBanner}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: c.textMuted }}>
          {pushState === 'on' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: c.green, fontWeight: 600 }}>
              <Icon name="checkCircle" size={12} color={c.green} /> Push notifications on
            </span>
          )}
        </div>
        {hasUnread && (
          <button onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: c.textSub, fontFamily: c.font }}>
            Mark all as read
          </button>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {items === null ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>No notifications yet</div>
        ) : (
          items.map(n => (
            <button key={n.id} onClick={() => handleOpen(n)} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%',
              padding: '13px 16px', background: n.is_read ? 'none' : c.primaryBg,
              border: 'none', borderBottom: `1px solid ${c.bg}`, cursor: 'pointer', textAlign: 'left', fontFamily: c.font,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: '#fff', border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <Icon name={TYPE_ICON[n.type] || 'bell'} size={14} color={c.textSub} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: c.text }}>{n.title}</div>
                <div style={{ fontSize: 12, color: c.textSub, marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                <div style={{ fontSize: 10, color: c.textMuted, marginTop: 4 }}>{fmtTime(n.created_at)}</div>
              </div>
              {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: 99, background: c.blue, flexShrink: 0, marginTop: 5 }} />}
            </button>
          ))
        )}
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Notifications" />
        <div style={{ padding: '20px 16px 40px' }}>{body}</div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Notifications</h1>
      </div>
      {body}
    </div>
  )
}
