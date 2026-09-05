import { Icon } from '@/components/Icons'

const TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-emerald-50 text-emerald-600',
  orange: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
}

export default function StatCard({ icon, label, value, sub, tone = 'neutral', onClick, trend }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-card text-left w-full
        ${onClick ? 'hover:border-slate-300 transition-colors cursor-pointer' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center ${TONES[tone]}`}>
          <Icon name={icon} size={16} />
        </div>
        {trend != null && (
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div>
        <div className="text-xl font-semibold text-slate-900 tabular-nums leading-none">{value}</div>
        <div className="text-xs font-medium text-slate-500 mt-1.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </Comp>
  )
}
