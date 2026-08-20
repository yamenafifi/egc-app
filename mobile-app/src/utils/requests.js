// Normalizes leave requests and attendance submissions into one shape so
// HomePage / RequestsListPage can merge and sort them in a single list —
// the two source objects (LeaveRequestModel, TimesheetSubmissionModel)
// have unrelated field names and status vocabularies.

const LEAVE_STATUS_MAP = { Open: 'pending', Approved: 'approved', Rejected: 'rejected' }

export function normalizeLeaveRequest(req) {
  return {
    kind: 'leave',
    id: req.id,
    title: req.leave_type || 'Leave',
    subtitle: `${req.from_date || '?'} → ${req.to_date || '?'}`,
    status: LEAVE_STATUS_MAP[req.status] || 'pending',
    rawStatusLabel: req.status,
    submittedAt: req.submitted_at,
    pushWarning: false,
    raw: req,
  }
}

export function normalizeSubmission(sub) {
  const projectCount = sub.project_ids?.length || 0
  return {
    kind: 'attendance',
    id: sub.id,
    title: `${projectCount} site${projectCount !== 1 ? 's' : ''} · ${sub.total_hours || 0}h`,
    subtitle: sub.period_start
      ? new Date(sub.period_start).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '',
    status: sub.status,
    rawStatusLabel: sub.status,
    submittedAt: sub.submitted_at,
    pushWarning: sub.status === 'approved' && !!sub.push_status && sub.push_status !== 'pushed',
    raw: sub,
  }
}

export function sortByMostRecent(items) {
  return [...items].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
}
