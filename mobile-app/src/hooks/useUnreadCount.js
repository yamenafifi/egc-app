import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { notificationsAPI } from '@/services/api'

const POLL_MS = 45000

export function useUnreadCount() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const { data } = await notificationsAPI.unreadCount()
      setCount(data.count || 0)
    } catch {
      // transient — next poll retries, nothing to surface to the user
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    refresh()
    const interval = setInterval(refresh, POLL_MS)
    return () => clearInterval(interval)
  }, [user, refresh])

  return { count, refresh }
}
