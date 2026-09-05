// Shown wherever an expense claim's AI extraction job status matters -
// the Accountant's review pane and the employee's own detail page. Purely
// presentational: the caller (useExpenseClaimPolling) is responsible for
// keeping `application` fresh while a job is in flight.

import { useState, useEffect } from 'react'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { JOB_STATUS_LABEL } from '@/utils/expenseClaims'

const ICON = { queued: 'clock', running: 'clock', succeeded: 'checkCircle', failed: 'alertCircle' }
const COLOR = { queued: c.blue, running: c.blue, succeeded: c.green, failed: c.red }
const BG = { queued: c.blueBg, running: c.blueBg, succeeded: c.greenBg, failed: c.redBg }
const BORDER = { queued: c.blueBorder, running: c.blueBorder, succeeded: c.greenBorder, failed: c.redBorder }

function elapsedLabel(startIso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export default function JobStatusPanel({ application, style }) {
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
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 8,
      background: BG[jobStatus], border: `1px solid ${BORDER[jobStatus]}`, ...style,
    }}>
      <Icon name={ICON[jobStatus]} size={14} color={COLOR[jobStatus]} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLOR[jobStatus] }}>
          AI Extraction Job — {JOB_STATUS_LABEL[jobStatus]}
          {inFlight && application.job_started_at && ` (${elapsedLabel(application.job_started_at)})`}
        </div>
        {jobStatus === 'failed' && application.processing_error && (
          <div style={{ fontSize: 11, color: c.textSub, marginTop: 3 }}>{application.processing_error}</div>
        )}
        {jobStatus === 'succeeded' && (
          <div style={{ fontSize: 11, color: c.textSub, marginTop: 3 }}>
            {application.receipts?.length || 0} receipt{application.receipts?.length !== 1 ? 's' : ''} extracted.
          </div>
        )}
      </div>
    </div>
  )
}
