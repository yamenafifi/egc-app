import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { settingsAPI, expenseCategoriesAPI } from '@/services/api'
import { PageHeader, Panel, PrimaryButton, SecondaryButton } from '@/desktop/components/Page'
import Drawer from '@/desktop/components/Drawer'
import Badge from '@/desktop/components/Badge'
import DataTable from '@/desktop/components/DataTable'
import ImportExportButton from '@/desktop/components/ImportExportButton'

const TABS = [
  { key: 'general', label: 'General' },
  { key: 'modules', label: 'Modules' },
  { key: 'timesheet', label: 'Timesheet' },
  { key: 'expense-claims', label: 'Expense Claims' },
]

const MODULES = [
  { key: 'timesheet', label: 'Timesheet', description: 'Clock in/out, timesheet submission, and the two-tier approval workflow.' },
  { key: 'leaves', label: 'Leaves', description: 'Leave requests and team approval.' },
  { key: 'deductions', label: 'Deductions', description: 'Supervisor-flagged deduction requests and employee appeals.' },
  { key: 'expense_claims', label: 'Expense Claims', description: 'Receipt submission, AI extraction, and the two-tier approval workflow.' },
]

const ERP_FIELDS = [
  { key: 'erp_base_url', label: 'Base URL', type: 'text', placeholder: 'https://erp.egc-me.com' },
  { key: 'erp_api_key', label: 'API Key', type: 'password' },
  { key: 'erp_api_secret', label: 'API Secret', type: 'password' },
]
const EGC_HR_FIELDS = [
  { key: 'egc_hr_base_url', label: 'Base URL', type: 'text', placeholder: 'https://erp.egc-me.com' },
  { key: 'egc_hr_api_key', label: 'API Key', type: 'password' },
  { key: 'egc_hr_api_secret', label: 'API Secret', type: 'password' },
]

function IntegrationField({ field, value, onChange, disabled }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{field.label}</label>
      <input
        type={field.type} value={value ?? ''} disabled={disabled} placeholder={field.placeholder}
        onChange={e => onChange(field.key, e.target.value)}
        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
      />
    </div>
  )
}

function ErpIntegrationCard({ canEdit }) {
  const [values, setValues] = useState(null)
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    settingsAPI.getErpIntegration()
      .then(({ data }) => { setValues(data.settings); setSaved(data.settings) })
      .catch(() => toast.error('Failed to load ERP integration settings'))
  }, [])

  const onChange = (key, value) => setValues(prev => ({ ...prev, [key]: value }))
  const dirty = values && saved && Object.keys(saved).some(k => values[k] !== saved[k])
  const urlMismatch = values && values.erp_base_url !== values.egc_hr_base_url
  const copyFromErp = () => setValues(prev => ({
    ...prev,
    egc_hr_base_url: prev.erp_base_url, egc_hr_api_key: prev.erp_api_key, egc_hr_api_secret: prev.erp_api_secret,
  }))

  const save = async () => {
    setSaving(true)
    try {
      const { data } = await settingsAPI.updateErpIntegration(values)
      setValues(data.settings); setSaved(data.settings)
      toast.success('ERP integration settings updated.')
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const test = async () => {
    setTesting(true); setTestResult(null)
    try { const { data } = await settingsAPI.testErpIntegration(); setTestResult(data) }
    catch { toast.error('Failed to run the connection test') }
    finally { setTesting(false) }
  }

  return (
    <Panel
      title="EGC ERP API Integration"
      action={canEdit && (
        <div className="flex items-center gap-2">
          {testResult && (
            <>
              <Badge tone={testResult.erp_connected ? 'green' : 'red'}>ERPNext {testResult.erp_connected ? 'Connected' : 'Failed'}</Badge>
              <Badge tone={testResult.egc_hr_connected ? 'green' : 'red'}>egc_hr {testResult.egc_hr_connected ? 'Connected' : 'Failed'}</Badge>
            </>
          )}
          <SecondaryButton onClick={test} disabled={testing || !values}>{testing ? 'Testing…' : 'Test Connection'}</SecondaryButton>
          <PrimaryButton onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</PrimaryButton>
        </div>
      )}
    >
      <p className="text-xs text-slate-500 mb-4">
        Two separate credential pairs talk to ERPNext under the hood - stock ERPNext calls (employees, projects,
        chart of accounts - used by, e.g., Add User) and egc_hr's own API (attendance, leave, deductions, project
        sites). Both are managed here so a credential rotation only has to happen in one place.
      </p>

      {!values ? (
        <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
      ) : (
        <div className="flex flex-col gap-5">
          {urlMismatch && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <Icon name="alertCircle" size={14} className="shrink-0 mt-0.5" />
              <div>
                These two connections point at different servers. Attendance, leave, deductions, and project
                sites/geofences all come from the egc_hr connection below - if that's not the same site as
                ERPNext, check-in and project lookups will reflect whatever's on that other server, not the one
                Add User/employee lookups use. Use "Copy from ERPNext" if they're meant to be the same site.
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-2">ERPNext Connection</div>
            <div className="grid grid-cols-3 gap-2.5">
              {ERP_FIELDS.map(f => (
                <IntegrationField key={f.key} field={f} value={values[f.key]} onChange={onChange} disabled={!canEdit} />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-600">egc_hr Connection</div>
              {canEdit && <button onClick={copyFromErp} className="text-[11px] font-semibold text-brand hover:underline">Copy from ERPNext</button>}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {EGC_HR_FIELDS.map(f => (
                <IntegrationField key={f.key} field={f} value={values[f.key]} onChange={onChange} disabled={!canEdit} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function GeneralTab({ canEdit }) {
  return <ErpIntegrationCard canEdit={canEdit} />
}

function VatNumberCard({ canEdit }) {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    settingsAPI.get()
      .then(({ data }) => { const v = data.settings.company_vat_number || ''; setValue(v); setSaved(v) })
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await settingsAPI.update({ company_vat_number: value.trim() })
      setSaved(value.trim())
      toast.success('VAT number updated.')
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <Panel title="Company VAT Number">
      <p className="text-xs text-slate-500 mb-3">
        Our own VAT registration number. The AI checks every receipt for this exact number - distinct
        from the vendor's own VAT number - and flags it on the receipt when present.
      </p>
      <div className="flex items-center gap-2 max-w-sm">
        <input
          value={value} disabled={loading || !canEdit} onChange={e => setValue(e.target.value)}
          className="flex-1 px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 tabular-nums"
          placeholder="e.g. 313056833700003"
        />
        {canEdit && (
          <PrimaryButton onClick={save} disabled={saving || loading || value.trim() === saved}>
            {saving ? 'Saving…' : 'Save'}
          </PrimaryButton>
        )}
      </div>
    </Panel>
  )
}

function CategoryField({ label, children }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

const MAX_ACCOUNT_RESULTS = 50

function AccountPicker({ accounts, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = accounts.find(a => a.name === value)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q
      ? accounts.filter(a => (a.account_name || '').toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      : accounts
    return pool.slice(0, MAX_ACCOUNT_RESULTS)
  }, [accounts, query])

  const select = (a) => { onChange(a.name); setQuery(''); setOpen(false) }

  return (
    <div ref={ref} className="relative">
      <input
        value={open ? query : (selected?.account_name || selected?.name || '')}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { setQuery(''); setOpen(true) }}
        placeholder="Search accounts by name…"
        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white"
      />
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto desktop-scrollbar bg-white rounded-lg border border-slate-200 shadow-popover z-50 py-1">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">No matching accounts.</div>
          ) : matches.map(a => (
            <button
              key={a.name}
              onClick={() => select(a)}
              className={`w-full flex flex-col px-3 py-1.5 text-left hover:bg-slate-50 ${a.name === value ? 'bg-slate-50' : ''}`}
            >
              <span className="text-sm text-slate-800">{a.account_name || a.name}</span>
              {a.account_name && <span className="text-[11px] text-slate-400">{a.name}</span>}
            </button>
          ))}
          {accounts.length > matches.length && (
            <div className="px-3 py-1.5 text-[11px] text-slate-400 border-t border-slate-100 mt-1">
              {accounts.length - matches.length} more - keep typing to narrow it down
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CategoryDrawer({ open, category, accounts, accountsError, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(category?.name || '')
    setAccount(category?.account || '')
    setDescription(category?.description || '')
  }, [open, category])

  if (!open) return null

  const submit = async () => {
    if (!name.trim() || !account || !description.trim()) {
      toast.error('Name, account, and description are all required.')
      return
    }
    const accountName = accounts.find(a => a.name === account)?.account_name || null
    setBusy(true)
    try {
      const payload = { name: name.trim(), account, account_name: accountName, description: description.trim() }
      const { data } = category
        ? await expenseCategoriesAPI.update(category.id, payload)
        : await expenseCategoriesAPI.create(payload)
      toast.success(category ? 'Category updated.' : 'Category added.')
      onSaved(data.category)
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save category') }
    finally { setBusy(false) }
  }

  return (
    <Drawer open={open} onClose={onClose} title={category ? 'Edit Expense Category' : 'New Expense Category'} width={440}>
      <div className="flex flex-col gap-3">
        <CategoryField label="Name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fuel"
            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white" />
        </CategoryField>

        <CategoryField label="Account">
          {accountsError ? (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-2.5 py-2">
              Could not load the Chart of Accounts from ERPNext: {accountsError}
            </div>
          ) : (
            <AccountPicker accounts={accounts} value={account} onChange={setAccount} />
          )}
        </CategoryField>

        <CategoryField label="Description (sent to the AI)">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            placeholder="Describe what kind of purchase belongs in this category - this is what the AI reads to decide."
            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white resize-y" />
        </CategoryField>

        <div className="flex gap-2 mt-2">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={submit} disabled={busy}>{busy ? 'Saving…' : category ? 'Save Changes' : 'Add Category'}</PrimaryButton>
        </div>
      </div>
    </Drawer>
  )
}

function ExpenseCategoriesCard({ canEdit }) {
  const [categories, setCategories] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [accountsError, setAccountsError] = useState(null)
  const [editing, setEditing] = useState(null) // null = closed, {} = new, {...} = editing
  const [bulkIds, setBulkIds] = useState(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(null) // {id, name}, or 'bulk'
  const [bulkBusy, setBulkBusy] = useState(false)

  const loadCategories = useCallback(async () => {
    try {
      const { data } = await expenseCategoriesAPI.list()
      setCategories(data.categories)
      setBulkIds(prev => new Set([...prev].filter(id => data.categories.some(c => c.id === id))))
    }
    catch { toast.error('Failed to load expense categories'); setCategories([]) }
  }, [])

  useEffect(() => { loadCategories() }, [loadCategories])

  useEffect(() => {
    if (!canEdit) return
    expenseCategoriesAPI.accounts()
      .then(({ data }) => setAccounts(data.accounts))
      .catch(e => setAccountsError(e.response?.data?.error || 'Could not reach ERPNext.'))
  }, [canEdit])

  const handleSaved = (category) => {
    setCategories(prev => {
      const exists = prev.some(c => c.id === category.id)
      return exists ? prev.map(c => c.id === category.id ? category : c) : [...prev, category].sort((a, b) => a.name.localeCompare(b.name))
    })
    setEditing(null)
  }

  const del = async (id) => {
    try { await expenseCategoriesAPI.remove(id); setCategories(prev => prev.filter(c => c.id !== id)); toast.success('Category deleted.') }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to delete category') }
    setConfirmingDelete(null)
  }

  const toggleBulk = (id) => setBulkIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleBulkAll = () => setBulkIds(prev => prev.size === categories.length ? new Set() : new Set(categories.map(c => c.id)))
  const deleteBulk = async () => {
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => expenseCategoriesAPI.remove(id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`${ids.length} categor${ids.length === 1 ? 'y' : 'ies'} deleted`)
      else toast.error(`${ids.length - failed} deleted, ${failed} failed`)
      setBulkIds(new Set()); setConfirmingDelete(null); loadCategories()
    } finally { setBulkBusy(false) }
  }

  return (
    <Panel
      title="Expense Categories"
      action={canEdit && (
        <div className="flex items-center gap-2">
          <ImportExportButton
            entityLabel="Expense Categories" filenameBase="expense_categories"
            onExport={expenseCategoriesAPI.export} onImportTemplate={expenseCategoriesAPI.importTemplate}
            onImport={expenseCategoriesAPI.import} onImported={loadCategories}
          />
          <PrimaryButton icon={<Icon name="plus" size={13} />} onClick={() => setEditing({})}>Add Category</PrimaryButton>
        </div>
      )}
    >
      <p className="text-xs text-slate-500 mb-3">
        Each category's description is sent to the AI so it can classify every extracted receipt automatically.
        The accountant can always correct a receipt's category by hand during review.
      </p>

      {confirmingDelete && (
        <div className="mb-3 p-3 rounded-lg border border-red-200 bg-red-50 flex items-center gap-3">
          <Icon name="alertCircle" size={14} className="text-red-500 shrink-0" />
          <div className="text-sm font-semibold text-red-700 flex-1">
            {confirmingDelete === 'bulk' ? `Delete ${bulkIds.size} categor${bulkIds.size === 1 ? 'y' : 'ies'}?` : `Delete category "${confirmingDelete.name}"?`}
          </div>
          <SecondaryButton onClick={() => setConfirmingDelete(null)}>Cancel</SecondaryButton>
          <SecondaryButton tone="danger" disabled={bulkBusy}
            onClick={() => confirmingDelete === 'bulk' ? deleteBulk() : del(confirmingDelete.id)}>
            {bulkBusy ? 'Deleting…' : 'Confirm Delete'}
          </SecondaryButton>
        </div>
      )}

      <div style={{ height: Math.max(200, 60 + (categories?.length || 0) * 45) }} className="max-h-[420px]">
        <DataTable
          columns={[
            { key: 'name', label: 'Name', sortable: true, render: r => <span className="font-medium text-slate-800">{r.name}</span> },
            { key: 'account_name', label: 'Account', sortable: true, render: r => r.account_name || r.account },
            { key: 'description', label: 'Description', render: r => <span className="text-slate-500 max-w-sm truncate block" title={r.description}>{r.description}</span> },
            ...(canEdit ? [{ key: 'actions', label: '', align: 'right', render: r => (
              <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                <button onClick={() => setEditing(r)} className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center">
                  <Icon name="edit" size={13} className="text-slate-500" />
                </button>
                <button onClick={() => setConfirmingDelete({ id: r.id, name: r.name })} className="w-6 h-6 rounded-md hover:bg-red-50 flex items-center justify-center">
                  <Icon name="trash" size={13} className="text-red-500" />
                </button>
              </div>
            ) }] : []),
          ]}
          rows={categories || []}
          loading={categories === null}
          searchKeys={['name', 'account_name', 'description']}
          searchPlaceholder="Search categories…"
          selection={canEdit ? { selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll } : undefined}
          bulkActions={canEdit ? [
            { key: 'delete', label: 'Delete', tone: 'danger', icon: <Icon name="trash" size={14} />, onClick: () => setConfirmingDelete('bulk') },
          ] : undefined}
          emptyTitle="No expense categories configured yet"
        />
      </div>

      <CategoryDrawer
        open={editing !== null} category={editing?.id ? editing : null}
        accounts={accounts} accountsError={accountsError}
        onClose={() => setEditing(null)} onSaved={handleSaved}
      />
    </Panel>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-slate-900' : 'bg-slate-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  )
}

function ModulesTab({ canEdit }) {
  const { modules, refetchModules } = useAuth()
  const [values, setValues] = useState(null)
  const [savingKey, setSavingKey] = useState(null)

  useEffect(() => { if (modules) setValues(modules) }, [modules])

  const toggle = async (moduleKey, enabled) => {
    const settingKey = `module_${moduleKey}_enabled`
    setSavingKey(moduleKey)
    setValues(prev => ({ ...prev, [settingKey]: enabled }))
    try {
      await settingsAPI.updateModules({ [settingKey]: enabled })
      toast.success(`${MODULES.find(m => m.key === moduleKey)?.label} ${enabled ? 'enabled' : 'disabled'}.`)
      refetchModules()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update module')
      setValues(prev => ({ ...prev, [settingKey]: !enabled }))
    } finally { setSavingKey(null) }
  }

  return (
    <Panel title="Modules">
      <p className="text-xs text-slate-500 mb-4">
        Disabling a module hides it from the sidebar and blocks its API for every user - useful for
        rolling out a subsystem gradually or pulling one back while it's reworked.
      </p>
      {!values ? (
        <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {MODULES.map(m => {
            const settingKey = `module_${m.key}_enabled`
            const enabled = values[settingKey] ?? true
            return (
              <div key={m.key} className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{m.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{m.description}</div>
                </div>
                <Badge tone={enabled ? 'green' : 'neutral'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
                <Toggle checked={enabled} onChange={v => toggle(m.key, v)} disabled={!canEdit || savingKey === m.key} />
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function TimesheetTab({ canEdit }) {
  const [values, setValues] = useState(null)
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    settingsAPI.getTimesheetSettings()
      .then(({ data }) => { setValues(data.settings); setSaved(data.settings) })
      .catch(() => toast.error('Failed to load timesheet settings'))
  }, [])

  const dirty = values && saved && Object.keys(saved).some(k => Number(values[k]) !== Number(saved[k]))

  const save = async () => {
    setSaving(true)
    try {
      const { data } = await settingsAPI.updateTimesheetSettings(values)
      setValues(data.settings); setSaved(data.settings)
      toast.success('Timesheet settings updated.')
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  return (
    <Panel
      title="Timesheet Settings"
      action={canEdit && <PrimaryButton onClick={save} disabled={saving || !values || !dirty}>{saving ? 'Saving…' : 'Save'}</PrimaryButton>}
    >
      <p className="text-xs text-slate-500 mb-4">
        These drive automatic overtime calculation at clock-out: anything worked past the standard
        workday plus break becomes overtime, with no manual entry from the employee.
      </p>
      {!values ? (
        <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Standard Workday (hours)</label>
            <input type="number" min="0" max="24" step="0.5" disabled={!canEdit}
              value={values.timesheet_standard_workday_hours}
              onChange={e => setValues(v => ({ ...v, timesheet_standard_workday_hours: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Break (hours)</label>
            <input type="number" min="0" max="24" step="0.5" disabled={!canEdit}
              value={values.timesheet_break_hours}
              onChange={e => setValues(v => ({ ...v, timesheet_break_hours: e.target.value }))}
              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50" />
          </div>
        </div>
      )}
    </Panel>
  )
}

function GeminiIntegrationCard({ canEdit }) {
  const [values, setValues] = useState(null)
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    settingsAPI.getGemini()
      .then(({ data }) => { setValues(data.settings); setSaved(data.settings) })
      .catch(() => toast.error('Failed to load Gemini settings'))
  }, [])

  const onChange = (key, value) => setValues(prev => ({ ...prev, [key]: value }))
  const dirty = values && saved && Object.keys(saved).some(k => values[k] !== saved[k])

  const save = async () => {
    setSaving(true)
    try {
      const { data } = await settingsAPI.updateGemini(values)
      setValues(data.settings); setSaved(data.settings)
      toast.success('Gemini settings updated.')
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to save') }
    finally { setSaving(false) }
  }

  const test = async () => {
    setTesting(true); setTestResult(null)
    try { const { data } = await settingsAPI.testGemini(); setTestResult(data) }
    catch { toast.error('Failed to run the connection test') }
    finally { setTesting(false) }
  }

  return (
    <Panel
      title="Gemini (AI Receipt Extraction)"
      action={canEdit && (
        <div className="flex items-center gap-2">
          {testResult && <Badge tone={testResult.gemini_connected ? 'green' : 'red'}>{testResult.gemini_connected ? 'Connected' : 'Failed'}</Badge>}
          <SecondaryButton onClick={test} disabled={testing || !values}>{testing ? 'Testing…' : 'Test Connection'}</SecondaryButton>
          <PrimaryButton onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</PrimaryButton>
        </div>
      )}
    >
      <p className="text-xs text-slate-500 mb-4">
        Powers automatic receipt extraction when an Accountant starts processing a claim. Get an API key from
        Google AI Studio - Gemini won't run while disabled or while no key is set, even if enabled.
      </p>

      {!values ? (
        <div className="text-sm text-slate-400 py-6 text-center">Loading…</div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
            <div>
              <div className="text-sm font-medium text-slate-800">Enable AI extraction</div>
              <div className="text-xs text-slate-400 mt-0.5">
                When off, "Start Processing" is unavailable on Expense Claims - Accountants enter every receipt field by hand instead.
              </div>
            </div>
            <Toggle checked={!!values.gemini_enabled} onChange={v => onChange('gemini_enabled', v)} disabled={!canEdit} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">API Key</label>
              <input
                type="password" value={values.gemini_api_key ?? ''} disabled={!canEdit}
                onChange={e => onChange('gemini_api_key', e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Model</label>
              <input
                type="text" value={values.gemini_model ?? ''} disabled={!canEdit} placeholder="gemini-3.6-flash"
                onChange={e => onChange('gemini_model', e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function ExpenseClaimsTab({ canEdit }) {
  return (
    <div className="flex flex-col gap-5">
      <VatNumberCard canEdit={canEdit} />
      <GeminiIntegrationCard canEdit={canEdit} />
      <ExpenseCategoriesCard canEdit={canEdit} />
    </div>
  )
}

export default function SystemSettingsPage() {
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('system.manage_settings')
  const [tab, setTab] = useState('general')

  return (
    <div>
      <PageHeader title="System Settings" sub="Configure system-wide behaviour for all users." />

      <div className="flex items-center gap-1 mb-5 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && <GeneralTab canEdit={canEdit} />}
      {tab === 'modules' && <ModulesTab canEdit={canEdit} />}
      {tab === 'timesheet' && <TimesheetTab canEdit={canEdit} />}
      {tab === 'expense-claims' && <ExpenseClaimsTab canEdit={canEdit} />}

      {!canEdit && (
        <div className="flex items-center gap-2.5 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-slate-600">
          <Icon name="alertCircle" size={15} className="text-amber-500" />
          You have view-only access to system settings.
        </div>
      )}
    </div>
  )
}
