import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { usersAPI, erpAPI, templatesAPI } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { PageHeader, Panel, PrimaryButton, SecondaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Badge from '@/desktop/components/Badge'
import ImportExportButton from '@/desktop/components/ImportExportButton'

const initials = n => n?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
const fmtDate = iso => !iso ? 'Never' : new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

// ── Create Account wizard (modal) ─────────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const [employees, setEmployees] = useState([])
  const [erpSearch, setErpSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [erpLoading, setErpLoading] = useState(false)
  const [form, setForm] = useState({ password: '', confirm: '', templateId: '' })
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { templatesAPI.list().then(r => setTemplates(r.data.templates || [])).catch(() => {}) }, [])

  const searchERP = useCallback(async () => {
    setErpLoading(true)
    try { const { data } = await erpAPI.listEmployees({ search: erpSearch, page_length: 20 }); setEmployees(data.employees || []) }
    catch { toast.error('Failed to fetch from ERPNext') } finally { setErpLoading(false) }
  }, [erpSearch])
  useEffect(() => { searchERP() }, [searchERP])

  const handleCreate = async () => {
    if (!form.password || form.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (form.password !== form.confirm) return toast.error('Passwords do not match')
    setLoading(true)
    try {
      const { data } = await usersAPI.create(selected.name, form.password)
      if (form.templateId && data.user?.id) { try { await templatesAPI.apply(form.templateId, data.user.id) } catch {} }
      toast.success(`Account created for ${selected.employee_name}`)
      onCreated()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to create account') } finally { setLoading(false) }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg'
  const labelClass = 'block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5'

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg w-full max-w-xl shadow-popover flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create User Account</h2>
            <p className="text-xs text-slate-400 mt-0.5">Step {step} of 2 — {step === 1 ? 'Select Employee' : 'Set Credentials & Role'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center shrink-0">
            <Icon name="x" size={16} className="text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto desktop-scrollbar flex-1">
          {step === 1 && (
            <>
              <label className={labelClass}>Search ERPNext Employees</label>
              <div className="relative mb-3">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input autoFocus value={erpSearch} onChange={e => setErpSearch(e.target.value)} placeholder="Search by name or Employee ID…" className={`${inputClass} pl-9`} />
              </div>
              <div className="border border-slate-200 rounded-lg max-h-60 overflow-y-auto desktop-scrollbar mb-3">
                {erpLoading ? (
                  <div className="p-4 text-sm text-slate-400">Loading from ERPNext…</div>
                ) : employees.length === 0 ? (
                  <div className="p-4 text-sm text-slate-400">No employees found.</div>
                ) : employees.map(emp => {
                  const isLinked = emp.custom_portal_account_status === 'Account Linked'
                  const isSel = selected?.name === emp.name
                  return (
                    <div key={emp.name} onClick={() => !isLinked && setSelected(emp)}
                      className={`flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-100 last:border-0 cursor-pointer
                        ${isSel ? 'bg-blue-50' : 'hover:bg-slate-50'} ${isLinked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">{initials(emp.employee_name)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800">{emp.employee_name}</div>
                        <div className="text-xs text-slate-400">{emp.name}{emp.designation && ` · ${emp.designation}`}{emp.department && ` · ${emp.department}`}</div>
                      </div>
                      {isLinked
                        ? <span className="text-[10px] font-bold text-blue-600 flex items-center gap-1"><Icon name="checkCircle" size={11} />Linked</span>
                        : isSel && <Icon name="check" size={16} className="text-blue-600" />}
                    </div>
                  )
                })}
              </div>
              {selected && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <Icon name="user" size={13} className="text-blue-600" />
                  <span className="font-semibold text-slate-800">{selected.employee_name}</span>
                  <span className="text-slate-400">· {selected.name}</span>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                <Icon name="user" size={13} className="text-blue-600" />
                <span className="font-semibold text-slate-800">{selected.employee_name}</span>
                <span className="text-slate-400">· {selected.name}</span>
              </div>
              <div>
                <label className={labelClass}>Initial Password *</label>
                <input autoFocus type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Min 8 chars, 1 uppercase, 1 number" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Confirm Password *</label>
                <input type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repeat password" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Permission Template (optional)</label>
                <select value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))} className={inputClass}>
                  <option value="">No template — default permissions only</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.nodes?.length || 0} permissions)</option>)}
                </select>
              </div>
              <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <Icon name="alertCircle" size={13} className="shrink-0 mt-0.5" /> The employee will be required to change this password on first login.
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          {step === 1 ? (
            <>
              <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
              <PrimaryButton onClick={() => setStep(2)} disabled={!selected} icon={<Icon name="arrowRight" size={13} />}>Next</PrimaryButton>
            </>
          ) : (
            <>
              <SecondaryButton onClick={() => setStep(1)} icon={<Icon name="arrowLeft" size={13} />}>Back</SecondaryButton>
              <PrimaryButton onClick={handleCreate} disabled={loading}>{loading ? 'Creating…' : 'Create Account'}</PrimaryButton>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── User detail (replaces the list in-place, like a drill-down page) ─────

function UserDetail({ userId, onBack, onChanged }) {
  const { hasPermission } = useAuth()
  const [user, setUser] = useState(null)
  const [perms, setPerms] = useState(null)
  const [localPerms, setLocalPerms] = useState([])
  const [savingPerms, setSavingPerms] = useState(false)
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingPw, setEditingPw] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [templates, setTemplates] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, pRes, tRes, dRes] = await Promise.all([
        usersAPI.get(userId), usersAPI.getPermissions(userId), templatesAPI.list(),
        usersAPI.getDevices(userId).catch(() => ({ data: { devices: [] } })),
      ])
      setUser(uRes.data.user); setPerms(pRes.data); setLocalPerms(pRes.data.permissions || [])
      setTemplates(tRes.data.templates || []); setDevices(dRes.data.devices || [])
    } catch { toast.error('Failed to load user') } finally { setLoading(false) }
  }, [userId])
  useEffect(() => { load() }, [load])

  const toggleActive = async () => {
    try {
      if (user.is_active) await usersAPI.deactivate(userId); else await usersAPI.reactivate(userId)
      toast.success(user.is_active ? 'Account deactivated' : 'Account reactivated'); load(); onChanged()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
  }
  const handleResetPw = async () => {
    if (newPw.length < 8) return toast.error('Password must be at least 8 characters')
    setPwLoading(true)
    try { await usersAPI.resetPassword(userId, newPw); toast.success('Password reset successfully'); setEditingPw(false); setNewPw('') }
    catch (e) { toast.error(e.response?.data?.error || 'Failed') } finally { setPwLoading(false) }
  }
  const handleApplyTemplate = async (templateId) => {
    if (!templateId) return
    try { await templatesAPI.apply(templateId, userId); toast.success('Template applied'); load() }
    catch (e) { toast.error(e.response?.data?.error || 'Failed') }
  }
  const handleSavePermissions = async () => {
    setSavingPerms(true)
    try { await usersAPI.updatePermissions(userId, localPerms); toast.success('Permissions updated'); load() }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to update permissions') } finally { setSavingPerms(false) }
  }
  const handleDelete = async () => {
    try { await usersAPI.delete(userId); toast.success('Account permanently deleted'); onBack(); onChanged() }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to delete account') }
    setDeleteConfirm(false)
  }

  if (loading) return <div className="text-sm text-slate-400 py-16 text-center">Loading…</div>
  if (!user) return null

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-4">
        <Icon name="arrowLeft" size={14} /> Back to users
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap bg-white rounded-lg border border-slate-200 shadow-card p-5 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold shrink-0">{initials(user.display_name)}</div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{user.display_name}</h1>
            <div className="flex gap-1.5 flex-wrap mt-1.5">
              <Badge tone={user.is_active ? 'green' : 'red'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
              {user.is_sysadmin && <Badge tone="orange">System Admin</Badge>}
              {user.erp_linked && <Badge tone="blue">ERP Linked</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!user.is_sysadmin && hasPermission('users.deactivate') && (
            <SecondaryButton tone={user.is_active ? 'danger' : 'default'} onClick={toggleActive} icon={<Icon name={user.is_active ? 'xCircle' : 'checkCircle'} size={14} />}>
              {user.is_active ? 'Deactivate' : 'Reactivate'}
            </SecondaryButton>
          )}
          {!user.is_sysadmin && (
            deleteConfirm ? (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-red-600">Confirm delete?</span>
                <SecondaryButton tone="danger" onClick={handleDelete}>Yes, Delete</SecondaryButton>
                <SecondaryButton onClick={() => setDeleteConfirm(false)}>Cancel</SecondaryButton>
              </div>
            ) : (
              <SecondaryButton tone="danger" onClick={() => setDeleteConfirm(true)} icon={<Icon name="trash" size={14} />}>Delete Account</SecondaryButton>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <Panel title="Account Details">
          <div className="flex flex-col">
            {[
              ['Username', user.username],
              ['Display Name', user.display_name],
              ['ERP Employee ID', user.erp_employee_id || '—'],
              ['IQAMA Number', user.iqama_number || '—'],
              ['Last Login', fmtDate(user.last_login)],
              ['Created', fmtDate(user.created_at)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-start gap-4 py-2 border-b border-slate-100 last:border-0">
                <div className="text-xs text-slate-400 font-medium shrink-0">{k}</div>
                <div className="text-sm text-slate-700 font-medium text-right">{v}</div>
              </div>
            ))}
          </div>
        </Panel>

        {hasPermission('users.reset_password') && (
          <Panel title="Password Management">
            {!editingPw ? (
              <div>
                <p className="text-sm text-slate-500 mb-3.5 leading-relaxed">Reset this user's password. They will be required to change it on next login.</p>
                <SecondaryButton onClick={() => setEditingPw(true)} icon={<Icon name="key" size={13} />}>Reset Password</SecondaryButton>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <input autoFocus type="password" placeholder="New password (min 8 chars)" value={newPw} onChange={e => setNewPw(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                <div className="flex gap-2">
                  <PrimaryButton onClick={handleResetPw} disabled={pwLoading}>{pwLoading ? 'Resetting…' : 'Set Password'}</PrimaryButton>
                  <SecondaryButton onClick={() => { setEditingPw(false); setNewPw('') }}>Cancel</SecondaryButton>
                </div>
              </div>
            )}
          </Panel>
        )}

        {hasPermission('users.assign_template') && templates.length > 0 && (
          <Panel title="Apply Permission Template">
            <p className="text-sm text-slate-500 mb-3 leading-relaxed">
              Applying a template replaces this user's current permissions.
              {user.permission_template && <span className="text-slate-400"> Currently using: <strong>{templates.find(t => t.id === user.permission_template)?.name || 'Unknown'}</strong></span>}
            </p>
            <select defaultValue="" onChange={e => handleApplyTemplate(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg">
              <option value="" disabled>Select a template to apply…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.nodes?.length || 0} permissions)</option>)}
            </select>
          </Panel>
        )}

        {hasPermission('users.view_permissions') && (
          <Panel title={`Devices & Sessions (${devices.length})`}>
            {devices.length === 0 ? (
              <div className="text-sm text-slate-400">No devices recorded for this user.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {devices.map(d => (
                  <div key={d.id} className="p-3 border border-slate-200 rounded-lg bg-slate-50">
                    <div className="text-sm font-semibold text-slate-800 mb-1">{d.extra_info?.platform || 'Unknown Device'}</div>
                    <div className="text-xs text-slate-400">IP: {d.last_ip || '—'}</div>
                    <div className="text-xs text-slate-400">Screen: {d.extra_info?.screen || '—'}</div>
                    <div className="text-xs text-slate-400">TZ: {d.extra_info?.timezone || '—'}</div>
                    <div className="text-xs text-slate-500 font-semibold mt-1">Last active: {fmtDate(d.last_active)}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {hasPermission('users.view_permissions') && perms && (
          <Panel
            className="col-span-2"
            title={`Custom Permissions (${(localPerms || []).length})`}
            action={hasPermission('users.edit_permissions') && !user.is_sysadmin && (
              <PrimaryButton onClick={handleSavePermissions} disabled={savingPerms}>{savingPerms ? 'Saving…' : 'Save Permissions'}</PrimaryButton>
            )}
          >
            {user.is_sysadmin ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <Icon name="checkCircle" size={14} /> System administrator — has all permissions
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(perms.all_nodes || {}).map(([node, desc]) => {
                  const has = localPerms.includes(node)
                  const canEdit = hasPermission('users.edit_permissions')
                  return (
                    <div key={node} onClick={() => { if (canEdit) setLocalPerms(prev => has ? prev.filter(p => p !== node) : [...prev, node]) }}
                      className={`flex items-start gap-2 p-2.5 rounded-lg border ${has ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} ${canEdit ? 'cursor-pointer' : ''}`}>
                      <div className={`w-4 h-4 rounded shrink-0 mt-0.5 border flex items-center justify-center ${has ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300'}`}>
                        {has && <Icon name="check" size={11} className="text-white" />}
                      </div>
                      <div>
                        <div className={`text-xs font-semibold font-mono ${has ? 'text-slate-800' : 'text-slate-400'}`}>{node}</div>
                        <div className="text-xs text-slate-400 leading-tight">{desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  )
}

export default function UsersPage() {
  const { hasPermission } = useAuth()
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [bulkIds, setBulkIds] = useState(new Set())
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [templateChoice, setTemplateChoice] = useState('')
  const [templates, setTemplates] = useState([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await usersAPI.list({ page: 1, page_length: 200 })
      setUsers(data.users); setTotal(data.total)
      setBulkIds(prev => new Set([...prev].filter(id => data.users.some(u => u.id === id))))
    }
    catch { toast.error('Failed to load users') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { templatesAPI.list().then(r => setTemplates(r.data.templates || [])).catch(() => {}) }, [])

  const selectableUsers = users.filter(u => !u.is_sysadmin)
  const toggleBulk = (id) => setBulkIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleBulkAll = () => {
    setBulkIds(prev => prev.size === selectableUsers.length ? new Set() : new Set(selectableUsers.map(u => u.id)))
  }
  const setActiveBulk = async (active) => {
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => active ? usersAPI.reactivate(id) : usersAPI.deactivate(id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`${ids.length} account(s) ${active ? 'reactivated' : 'deactivated'}`)
      else toast.error(`${ids.length - failed} updated, ${failed} failed`)
      setBulkIds(new Set()); load()
    } finally { setBulkBusy(false) }
  }
  const applyTemplateBulk = async () => {
    if (!templateChoice) return toast.error('Choose a template first.')
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => templatesAPI.apply(templateChoice, id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`Template applied to ${ids.length} account(s)`)
      else toast.error(`${ids.length - failed} applied, ${failed} failed`)
      setBulkIds(new Set()); setApplyingTemplate(false); setTemplateChoice('')
    } finally { setBulkBusy(false) }
  }

  if (detailId) return <UserDetail userId={detailId} onBack={() => setDetailId(null)} onChanged={load} />

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="User Accounts"
        sub={`${total} account${total !== 1 ? 's' : ''}`}
        action={(
          <div className="flex items-center gap-2">
            {hasPermission('users.edit_permissions') && (
              <ImportExportButton
                entityLabel="Users" filenameBase="users"
                onExport={usersAPI.export} onImportTemplate={usersAPI.importTemplate}
                onImport={usersAPI.import} onImported={load}
              />
            )}
            {hasPermission('users.create') && (
              <PrimaryButton onClick={() => setShowCreate(true)} icon={<Icon name="plus" size={14} />}>New Account</PrimaryButton>
            )}
          </div>
        )}
      />

      {applyingTemplate && (
        <div className="mb-4 p-4 rounded-lg border border-slate-200 bg-white flex items-center gap-3">
          <div className="text-sm font-semibold text-slate-700 shrink-0">Apply template to {bulkIds.size} account(s)</div>
          <select value={templateChoice} onChange={e => setTemplateChoice(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="">Select a template…</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex-1" />
          <SecondaryButton onClick={() => { setApplyingTemplate(false); setTemplateChoice('') }}>Cancel</SecondaryButton>
          <PrimaryButton onClick={applyTemplateBulk} disabled={bulkBusy}>{bulkBusy ? 'Applying…' : 'Confirm'}</PrimaryButton>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <DataTable
          columns={[
            { key: 'display_name', label: 'Name', sortable: true, render: r => (
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">{initials(r.display_name)}</div>
                <span className="font-semibold text-slate-800">{r.display_name}</span>
              </div>
            ) },
            { key: 'username', label: 'Username', sortable: true, render: r => <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{r.username}</code> },
            { key: 'erp_employee_id', label: 'ERP ID', sortable: true, render: r => r.erp_employee_id || '—' },
            { key: 'status', label: 'Status', render: r => (
              <div className="flex gap-1 flex-wrap">
                <Badge tone={r.is_active ? 'green' : 'red'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>
                {r.is_sysadmin && <Badge tone="orange">Admin</Badge>}
                {r.erp_linked && <Badge tone="blue">ERP Linked</Badge>}
              </div>
            ) },
            { key: 'last_login', label: 'Last Login', sortable: true, render: r => fmtDate(r.last_login) },
          ]}
          rows={users}
          loading={loading}
          searchKeys={['display_name', 'username', 'erp_employee_id']}
          onRowClick={row => setDetailId(row.id)}
          selection={{ selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll }}
          bulkActions={[
            { key: 'deactivate', label: 'Deactivate', tone: 'danger', icon: <Icon name="xCircle" size={14} />, onClick: () => setActiveBulk(false) },
            { key: 'reactivate', label: 'Reactivate', icon: <Icon name="checkCircle" size={14} />, onClick: () => setActiveBulk(true) },
            { key: 'apply-template', label: 'Apply Template', icon: <Icon name="shield" size={14} />, onClick: () => setApplyingTemplate(true) },
          ]}
          emptyTitle="No accounts found"
        />
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} />}
    </div>
  )
}
