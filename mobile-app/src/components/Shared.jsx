// Universal shared components used across all pages

import { c } from '@/theme'
import { Icon } from '@/components/Icons'

// Universal page wrapper — handles full-width layout consistently
export function PageWrap({ children }) {
  return (
    <div style={{ fontFamily: c.font, width: '100%', animation: 'fadeIn 0.2s ease' }}>
      {children}
    </div>
  )
}

// Universal page header with optional action button
export function PageHeader({ title, sub, action }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      marginBottom: 24, flexWrap: 'wrap', gap: 12,
    }}>
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>{title}</h1>
        {sub && <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// Universal primary button — consistent across all pages
export function PrimaryBtn({ children, onClick, disabled, type = 'button', style = {} }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '10px 18px', background: disabled ? c.borderStrong : c.primary,
        color: '#fff', border: 'none', borderRadius: 8,
        fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: c.font, boxShadow: disabled ? 'none' : `0 2px 6px ${c.primary}40`,
        opacity: disabled ? 0.65 : 1, transition: 'all 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// Universal status badge
export function Badge({ type, children }) {
  const map = {
    active:   { bg: c.greenBg,   color: c.green,   border: c.greenBorder },
    inactive: { bg: c.redBg,     color: c.red,      border: c.redBorder },
    linked:   { bg: c.blueBg,    color: c.blue,     border: c.blueBorder },
    admin:    { bg: c.orangeBg,  color: c.orange,   border: c.orangeBorder },
    pending:  { bg: c.orangeBg,  color: c.orange,   border: c.orangeBorder },
    approved: { bg: c.greenBg,   color: c.green,    border: c.greenBorder },
    rejected: { bg: c.redBg,     color: c.red,      border: c.redBorder },
    pushed:   { bg: c.purpleBg,  color: c.purple,   border: c.purpleBorder },
    neutral:  { bg: c.bg,        color: c.textMuted, border: c.border },
  }
  const s = map[type] || map.neutral
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 700,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {children}
    </span>
  )
}

// Universal card container
export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: c.surface, borderRadius: 12,
      border: `1px solid ${c.border}`, boxShadow: c.sm,
      ...style,
    }}>
      {children}
    </div>
  )
}

// Universal section label
export function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

// Universal loading spinner block
export function LoadingBlock({ text = 'Loading…' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 48, color: c.textMuted, fontSize: 13 }}>
      <div style={{ width: 22, height: 22, border: `2px solid ${c.primaryBg}`, borderTopColor: c.primary, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      {text}
    </div>
  )
}

// Universal empty state
export function EmptyState({ icon, title, sub, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '56px 24px', color: c.textMuted, textAlign: 'center' }}>
      <Icon name={icon} size={40} color={c.borderStrong} />
      <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: c.textSub, lineHeight: 1.6, maxWidth: 360 }}>{sub}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}
