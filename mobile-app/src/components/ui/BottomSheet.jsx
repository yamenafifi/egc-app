// BottomSheet — a slide-up modal docked to the bottom of the viewport
// (capped at maxWidth 560), on mobile and desktop alike - there is no
// desktop-specific centered variant. Fine for lightweight, single-purpose
// modals (confirmations, small forms); a page whose "detail" IS the main
// content on desktop (Attendance, Leaves, Deductions Review, Expense
// Claims) uses an inline MasterDetail pane instead - see
// components/layout/MasterDetail.jsx.
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'

export default function BottomSheet({ open, onClose, title, children, maxHeight = 'calc(85dvh - env(safe-area-inset-bottom))' }) {
  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  // Rendered via a portal straight onto <body> - AppLayout's mobile route
  // wrapper animates `transform` on page change (mobilePageSlide), and any
  // ancestor with an active transform/animation becomes the containing
  // block for descendant position:fixed elements. Left in the normal tree,
  // this sheet would be positioned relative to that (shorter, animated)
  // wrapper instead of the real viewport - which is exactly why its bottom
  // portion used to render clipped behind the mobile bottom nav.
  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          background: c.surface,
          borderRadius: '18px 18px 0 0',
          maxHeight,
          display: 'flex', flexDirection: 'column',
          animation: 'slideUp 0.25s ease',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.12)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: c.border }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px 12px', borderBottom: `1px solid ${c.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{title}</span>
          <button onClick={onClose} style={{
            background: c.bg, border: 'none', borderRadius: 99,
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
            <Icon name="x" size={14} color={c.textMuted} />
          </button>
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px calc(24px + env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </div>
  ), document.body)
}
