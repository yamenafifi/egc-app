// Mirrors DeductionRequestModel.CATEGORY_HINTS on the server - keep in sync.
// Traffic violations are deliberately excluded: those are sent by the
// company head directly to HR and recorded manually in egc_hr, a
// separate process from this supervisor-flagged flow.
export const CATEGORY_HINTS = ['Equipment / Tool Damage', 'Unproductive Hours', 'Other']

export const APPEAL_STATUS_STYLE = {
  Pending: { label: 'Appeal Pending' },
  Upheld: { label: 'Appeal Upheld' },
  Overturned: { label: 'Appeal Overturned' },
}
