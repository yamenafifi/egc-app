import { useEffect } from 'react'
import { expenseClaimsAPI } from '@/services/api'

// Polls GET /expense-claims/:id every `intervalMs` while the application's
// AI extraction job is in flight, and stops itself the moment it settles.
// This is the only way the UI learns a background job (see job_queue.py /
// expense_claim_processor.py on the server) has moved on - nothing pushes
// updates to the client.
export function useExpenseClaimPolling(application, onUpdate, intervalMs = 3000) {
  const jobStatus = application?.job_status
  const id = application?.id

  useEffect(() => {
    if (!id || (jobStatus !== 'queued' && jobStatus !== 'running')) return
    const interval = setInterval(async () => {
      try {
        const { data } = await expenseClaimsAPI.get(id)
        onUpdate(data.application)
      } catch {
        // transient network hiccup - the next tick retries
      }
    }, intervalMs)
    return () => clearInterval(interval)
  }, [id, jobStatus, intervalMs, onUpdate])
}
