// MenuList — tappable list rows, Apple-style monochrome
import { c } from '@/theme'
import { Icon } from '@/components/Icons'

export default function MenuList({ items }) {
  return (
    <div style={{
      background: c.surface,
      borderRadius: 14,
      border: `1px solid ${c.border}`,
      overflow: 'hidden',
    }}>
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          disabled={item.disabled}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            width: '100%', padding: '13px 16px',
            background: 'none', border: 'none',
            borderBottom: i < items.length - 1 ? `1px solid ${c.border}` : 'none',
            cursor: item.disabled ? 'default' : 'pointer',
            textAlign: 'left', fontFamily: c.font,
            opacity: item.disabled ? 0.38 : 1,
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = c.bg }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
        >
          {/* Icon — always neutral gray, no color */}
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Icon name={item.icon} size={16} color={c.textSub} />
          </div>

          {/* Label + sub */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: c.text, lineHeight: 1.3 }}>{item.label}</div>
            {item.sub && <div style={{ fontSize: 11, color: c.textMuted, marginTop: 1 }}>{item.sub}</div>}
          </div>

          {/* Chevron */}
          <Icon name="chevronRight" size={14} color={c.textMuted} style={{ flexShrink: 0 }} />
        </button>
      ))}
    </div>
  )
}
