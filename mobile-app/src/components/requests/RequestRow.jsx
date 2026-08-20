import { c } from '@/theme'
import { Icon } from '@/components/Icons'

const STATUS_STYLE = {
  pending:             { bg: c.orangeBg, color: c.orange, border: c.orangeBorder, label: 'Pending' },
  supervisor_approved: { bg: c.blueBg,   color: c.blue,   border: c.blueBorder,   label: 'Awaiting Final Approval' },
  approved:            { bg: c.greenBg,  color: c.green,  border: c.greenBorder,  label: 'Approved' },
  rejected:            { bg: c.redBg,    color: c.red,    border: c.redBorder,    label: 'Rejected' },
}

export function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
      fontSize: 10, fontWeight: 700, background: s.bg, color: s.color,
      border: `1px solid ${s.border}`, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

export default function RequestRow({ item, onClick }) {
  const icon = item.kind === 'leave' ? 'calendar' : 'clock'
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%',
      padding: '12px 16px', background: 'none', border: 'none',
      borderBottom: `1px solid ${c.bg}`, cursor: 'pointer', textAlign: 'left', fontFamily: c.font,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 9, background: c.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name={icon} size={15} color={c.textSub} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: c.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: c.textMuted, marginTop: 1 }}>{item.subtitle}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <StatusBadge status={item.status} />
        {item.pushWarning && <Icon name="alertCircle" size={13} color={c.orange} />}
      </div>
    </button>
  )
}
