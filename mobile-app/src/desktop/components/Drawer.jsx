import { Icon } from '@/components/Icons'

// A right-side detail drawer - the desktop-native replacement for the
// mobile BottomSheet. A sheet that slides up from the bottom of a huge
// desktop viewport reads as a phone screen; a panel that slides in from
// the side, alongside the table it came from, reads as a real app.
export default function Drawer({ open, onClose, title, sub, children, width = 480 }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[200] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/30" />
      <div
        onClick={e => e.stopPropagation()}
        style={{ width }}
        className="relative h-full bg-white shadow-popover flex flex-col animate-[slideInRight_0.2s_ease-out]"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-slate-900 truncate">{title}</div>
            {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
          </div>
          <button onClick={onClose} className="shrink-0 w-7 h-7 rounded-md hover:bg-slate-100 flex items-center justify-center">
            <Icon name="x" size={15} className="text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto desktop-scrollbar p-5">{children}</div>
      </div>
      <style>{`@keyframes slideInRight { from { transform: translateX(24px); opacity: 0.6 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </div>
  )
}
