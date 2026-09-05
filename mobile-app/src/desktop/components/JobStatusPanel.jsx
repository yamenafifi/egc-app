import { useState, useEffect } from 'react'
import { Icon } from '@/components/Icons'
import { JOB_STATUS_LABEL } from '@/utils/expenseClaims'

const TONE = {
  queued: 'bg-blue-50 border-blue-200 text-blue-700',
  running: 'bg-blue-50 border-blue-200 text-blue-700',
  succeeded: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  failed: 'bg-red-50 border-red-200 text-red-700',
}
const ICON = { queued: 'clock', running: 'clock', succeeded: 'checkCircle', failed: 'alertCircle' }

function elapsedLabel(startIso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export default function JobStatusPanel({ application }) {
  const jobStatus = application?.job_status
  const [, tick] = useState(0)

  useEffect(() => {
    if (jobStatus !== 'queued' && jobStatus !== 'running') return
    const interval = setInterval(() => tick(n => n + 1), 1000)
    return () => clearInterval(interval)
  }, [jobStatus])

  if (!jobStatus) return null
  const inFlight = jobStatus === 'queued' || jobStatus === 'running'

  return (
    <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm ${TONE[jobStatus]}`}>
      <Icon name={ICON[jobStatus]} size={14} className="shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="font-semibold">
          AI Extraction Job — {JOB_STATUS_LABEL[jobStatus]}
          {inFlight && application.job_started_at && ` (${elapsedLabel(application.job_started_at)})`}
        </div>
        {jobStatus === 'failed' && application.processing_error && (
          <div className="text-xs mt-1 opacity-90">{application.processing_error}</div>
        )}
        {jobStatus === 'succeeded' && (
          <div className="text-xs mt-1 opacity-90">{application.receipts?.length || 0} receipt(s) extracted.</div>
        )}
      </div>
    </div>
  )
}
