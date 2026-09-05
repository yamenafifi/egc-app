// Layout primitives shared by every desktop page - a page header (title,
// subtitle, primary action) and a content panel. Kept intentionally tiny;
// the point of this redesign is real tables and dashboards, not another
// layer of abstraction. Sizing/radius/weight throughout is deliberately
// restrained - inspired by Frappe's own UI (frappe-ui): compact controls,
// rounded-md (not rounded-xl/pill) corners, medium (not bold) button
// weight, calm neutral color use with a single dark primary action color.

export function PageHeader({ title, sub, action }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {sub && <p className="text-sm text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  )
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-card ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          {title && <h2 className="text-[13px] font-semibold text-slate-700">{title}</h2>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function PrimaryButton({ children, onClick, icon, disabled, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-white text-[13px] font-medium
                 hover:bg-brand-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {icon}
      {children}
    </button>
  )
}

export function SecondaryButton({ children, onClick, icon, disabled, tone = 'default' }) {
  const toneClass = tone === 'danger'
    ? 'text-red-600 border-red-200 bg-white hover:bg-red-50'
    : 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[13px] font-medium transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed ${toneClass}`}
    >
      {icon}
      {children}
    </button>
  )
}
