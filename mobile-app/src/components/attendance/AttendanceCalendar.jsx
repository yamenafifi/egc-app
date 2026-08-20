import { useState, useMemo } from 'react'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const STATUS_COLOR = { present: c.green, leave: c.blue }

function pad(n) { return String(n).padStart(2, '0') }
function dateKey(year, month, day) { return `${year}-${pad(month + 1)}-${pad(day)}` }

// records: ClockRecordModel.to_public() rows (closed/bundled) - any day
// with one is "present". approvedLeaves: LeaveRequestModel.to_public() rows
// with status "Approved" - every day in [from_date, to_date] is "On Leave".
// EGC App has no shift/holiday calendar to compare against, so "Half Day"/
// "Absent" aren't computable here and are deliberately not shown - showing
// them would mean fabricating a status this app has no data to back up.
export default function AttendanceCalendar({ records, approvedLeaves }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const year = cursor.getFullYear()
  const month = cursor.getMonth()

  const dayStatuses = useMemo(() => {
    const map = {}
    for (const r of records) {
      if (!r.clock_in) continue
      map[r.clock_in.slice(0, 10)] = 'present'
    }
    for (const l of approvedLeaves) {
      if (!l.from_date || !l.to_date) continue
      const cur = new Date(l.from_date)
      const end = new Date(l.to_date)
      while (cur <= end) {
        const key = dateKey(cur.getFullYear(), cur.getMonth(), cur.getDate())
        if (!map[key]) map[key] = 'leave'
        cur.setDate(cur.getDate() + 1)
      }
    }
    return map
  }, [records, approvedLeaves])

  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)

  const counts = { present: 0, leave: 0 }
  for (let day = 1; day <= daysInMonth; day++) {
    const status = dayStatuses[dateKey(year, month, day)]
    if (status) counts[status] += 1
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} style={navBtnStyle}>
          <Icon name="chevronLeft" size={16} color={c.textSub} />
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>
          {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} style={navBtnStyle}>
          <Icon name="chevronRight" size={16} color={c.textSub} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: c.textMuted, padding: '4px 0' }}>{w}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />
          const status = dayStatuses[dateKey(year, month, day)]
          return (
            <div key={i} style={{ textAlign: 'center', padding: '8px 0', fontSize: 13, color: c.text }}>
              {day}
              <div style={{ width: 5, height: 5, borderRadius: 99, margin: '3px auto 0', background: status ? STATUS_COLOR[status] : 'transparent' }} />
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 20, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.bg}`, flexWrap: 'wrap' }}>
        <LegendItem color={c.green} label="Present" count={counts.present} />
        <LegendItem color={c.blue} label="On Leave" count={counts.leave} />
      </div>
    </div>
  )
}

function LegendItem({ color, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: c.textSub }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: c.text }}>{count}</span>
    </div>
  )
}

const navBtnStyle = { background: c.bg, border: 'none', borderRadius: 8, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
