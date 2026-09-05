import { useMemo, useState, useRef, useEffect } from 'react'
import { Icon } from '@/components/Icons'

/**
 * A real desktop data table - sortable columns, a search box, optional
 * status-filter chips, row click, and row actions. This is the piece that
 * actually makes a page "desktop" instead of a mobile card list stretched
 * wide: dense rows, scannable columns, click-to-sort headers.
 *
 * columns: [{ key, label, sortable, width, render(row), align }]
 * rows: plain array of objects; sorting/searching operate on `column.key`
 * unless a column provides `sortValue(row)`.
 */
function BulkActionsMenu({ count, actions }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white
                   text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        Actions ({count})
        <Icon name="chevronDown" size={12} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="absolute top-9 left-0 min-w-[190px] bg-white rounded-lg border border-slate-200 shadow-popover overflow-hidden z-50 py-1">
          {actions.map(a => (
            <button
              key={a.key}
              onClick={() => { setOpen(false); a.onClick() }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors
                ${a.tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {a.icon}{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DataTable({
  columns,
  rows,
  keyField = 'id',
  searchPlaceholder = 'Search…',
  searchKeys,
  filters,
  activeFilter,
  onFilterChange,
  onRowClick,
  emptyTitle = 'Nothing here',
  emptyBody = '',
  loading = false,
  rightAction,
  selection, // { selectedIds: Set, onToggle(id), onToggleAll() } - adds a checkbox column
  bulkActions, // [{ key, label, icon, tone: 'default'|'danger', onClick(selectedIds) }] -
  // the standard Frappe-style "Actions" popup, shown next to search whenever
  // `selection` is passed and at least one row is checked. Requires `selection`.
  searchValue, // controlled search - pass this + onSearchChange to drive the box externally
  onSearchChange, // (e.g. a server-side search a page needs, like matching nested array
  // fields the client-side filter below can't see). Uncontrolled (internal state) otherwise.
}) {
  const [internalSearch, setInternalSearch] = useState('')
  const isControlled = searchValue !== undefined
  const search = isControlled ? searchValue : internalSearch
  const setSearch = isControlled ? onSearchChange : setInternalSearch
  const [sort, setSort] = useState({ key: null, dir: 'asc' })

  const filtered = useMemo(() => {
    let out = rows
    // Controlled mode means a page is doing its own (often server-side,
    // e.g. across fields the row object here doesn't even carry) search -
    // re-filtering here on the same text against only `searchKeys` could
    // incorrectly drop rows that matched server-side on a different field.
    if (!isControlled && search.trim()) {
      const q = search.trim().toLowerCase()
      const keys = searchKeys || columns.map(c => c.key)
      out = out.filter(row =>
        keys.some(k => String(row[k] ?? '').toLowerCase().includes(q))
      )
    }
    return out
  }, [rows, search, searchKeys, columns, isControlled])

  const sorted = useMemo(() => {
    if (!sort.key) return filtered
    const col = columns.find(c => c.key === sort.key)
    const getVal = col?.sortValue || (row => row[sort.key])
    const out = [...filtered].sort((a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return av - bv
      return String(av).localeCompare(String(bv))
    })
    return sort.dir === 'desc' ? out.reverse() : out
  }, [filtered, sort, columns])

  const toggleSort = (key) => {
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' })
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 pb-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-1.5 text-[13px] rounded-md border border-slate-200 bg-white
                       placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-slate-300"
          />
        </div>

        {selection && selection.selectedIds.size > 0 && bulkActions?.length > 0 && (
          <BulkActionsMenu
            count={selection.selectedIds.size}
            actions={bulkActions.map(a => ({ ...a, onClick: () => a.onClick([...selection.selectedIds]) }))}
          />
        )}

        {filters && (
          <div className="flex items-center gap-1.5">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => onFilterChange(f.key)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  activeFilter === f.key
                    ? 'bg-brand text-white'
                    : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {f.label}{f.count != null ? ` (${f.count})` : ''}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />
        {rightAction}
      </div>

      <div className="flex-1 min-h-0 overflow-auto desktop-scrollbar rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-[13px] border-collapse">
          <thead className="sticky top-0 bg-slate-50 z-10">
            <tr>
              {selection && (
                <th className="w-10 px-4 py-2 border-b border-slate-200">
                  <input
                    type="checkbox"
                    checked={sorted.length > 0 && sorted.every(r => selection.selectedIds.has(r[keyField]))}
                    onChange={selection.onToggleAll}
                  />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`text-[11px] font-medium text-slate-500 uppercase tracking-wide px-4 py-2 border-b border-slate-200
                    ${col.align === 'right' ? 'text-right' : 'text-left'}
                    ${col.sortable ? 'cursor-pointer select-none hover:text-slate-700' : ''}`}
                  onClick={() => col.sortable && toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sort.key === col.key && (
                      <Icon name="chevronDown" size={11} className={sort.dir === 'asc' ? 'rotate-180' : ''} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + (selection ? 1 : 0)} className="px-4 py-16 text-center text-slate-400 text-sm">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selection ? 1 : 0)} className="px-4 py-16 text-center">
                  <div className="text-sm font-medium text-slate-600">{emptyTitle}</div>
                  {emptyBody && <div className="text-xs text-slate-400 mt-1">{emptyBody}</div>}
                </td>
              </tr>
            ) : sorted.map(row => (
              <tr
                key={row[keyField]}
                onClick={() => onRowClick?.(row)}
                className={`border-b border-slate-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''} transition-colors`}
              >
                {selection && (
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selection.selectedIds.has(row[keyField])} onChange={() => selection.onToggle(row[keyField])} />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} className={`px-4 py-2.5 text-slate-700 align-middle ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pt-2 text-xs text-slate-400">
        {sorted.length} of {rows.length} {rows.length === 1 ? 'row' : 'rows'}
      </div>
    </div>
  )
}
