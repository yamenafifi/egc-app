// Single source of truth for expense claim status/job-status presentation -
// previously duplicated, slightly differently, across MyExpenseClaimsPage
// and ExpenseClaimsReviewPage. Keep every expense-claim page importing
// from here rather than redefining its own badge map.

import { c } from '@/theme'

export const STATUS_BADGE = {
  submitted: { bg: c.blueBg, color: c.blue, border: c.blueBorder, label: 'Submitted', tone: 'blue' },
  processing: { bg: c.blueBg, color: c.blue, border: c.blueBorder, label: 'Processing', tone: 'blue' },
  extracted: { bg: c.orangeBg, color: c.orange, border: c.orangeBorder, label: 'Under Review', tone: 'orange' },
  accountant_approved: { bg: c.orangeBg, color: c.orange, border: c.orangeBorder, label: 'Awaiting Final Approval', tone: 'orange' },
  approved: { bg: c.greenBg, color: c.green, border: c.greenBorder, label: 'Approved', tone: 'green' },
  rejected: { bg: c.redBg, color: c.red, border: c.redBorder, label: 'Needs Correction', tone: 'red' },
  withdrawn: { bg: c.primaryBg, color: c.textSub, border: c.primaryBorder, label: 'Withdrawn', tone: 'neutral' },
}

export function statusBadge(status) {
  return STATUS_BADGE[status] || STATUS_BADGE.submitted
}

export const JOB_STATUS_LABEL = {
  queued: 'Queued',
  running: 'Extracting…',
  succeeded: 'Completed',
  failed: 'Failed',
}

export function fmtClaimDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
