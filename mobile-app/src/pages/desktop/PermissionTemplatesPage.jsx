import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { templatesAPI } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { PageHeader, Panel, PrimaryButton, SecondaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'

function TemplateForm({ initial, groups, onSave, onCancel, saving }) {
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.description || '')
  const [nodes, setNodes] = useState(new Set(initial?.nodes || []))

  const toggle = n => setNodes(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })
  const toggleGroup = groupNodes => {
    const gn = Object.keys(groupNodes)
    const allOn = gn.every(n => nodes.has(n))
    setNodes(prev => { const s = new Set(prev); gn.forEach(n => allOn ? s.delete(n) : s.add(n)); return s })
  }
  const handleSave = () => {
    if (!name.trim()) return toast.error('Name is required')
    if (!nodes.size) return toast.error('Select at least one permission')
    onSave({ id: initial?.id, name: name.trim(), description: desc.trim(), nodes: [...nodes] })
  }

  return (
    <div>
      <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-4">
        <Icon name="chevronLeft" size={14} /> Back to templates
      </button>
      <h1 className="text-lg font-semibold text-slate-900 mb-4">{initial ? 'Edit Template' : 'New Template'}</h1>

      <Panel className="max-w-3xl">
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Template Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Site Supervisor, Office Staff"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What role is this template for?"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
          </div>
        </div>

        <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
          <div className="text-sm font-semibold text-slate-800">Permissions</div>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600">{nodes.size} selected</span>
        </div>

        {!groups ? (
          <div className="text-sm text-slate-400 py-6 text-center">Loading permission catalogue…</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {groups.map(g => {
              const gNodes = Object.keys(g.nodes)
              const allOn = gNodes.every(n => nodes.has(n))
              const someOn = gNodes.some(n => nodes.has(n))
              return (
                <div key={g.key} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <Icon name={g.icon} size={13} className={someOn ? 'text-slate-700' : 'text-slate-400'} />
                      <span className={`text-xs font-bold ${someOn ? 'text-slate-800' : 'text-slate-500'}`}>{g.label}</span>
                      {someOn && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-white">{gNodes.filter(n => nodes.has(n)).length}/{gNodes.length}</span>}
                    </div>
                    <button onClick={() => toggleGroup(g.nodes)} className="text-xs font-semibold text-blue-600">
                      {allOn ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2">
                    {gNodes.map(n => (
                      <label key={n} className={`flex items-start gap-2.5 px-3.5 py-2 border-b border-r border-slate-100 cursor-pointer ${nodes.has(n) ? 'bg-blue-50/60' : ''}`}>
                        <input type="checkbox" checked={nodes.has(n)} onChange={() => toggle(n)} className="mt-0.5 shrink-0" />
                        <div>
                          <div className="text-xs font-semibold text-slate-800 capitalize">{n.split('.').slice(-1)[0].replace(/_/g, ' ')}</div>
                          <div className="text-xs text-slate-400 leading-tight">{g.nodes[n]}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
          <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving || !groups}>{saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Template'}</PrimaryButton>
        </div>
      </Panel>
    </div>
  )
}

export default function PermissionTemplatesPage() {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('permission_templates.create')
  const canEdit = hasPermission('permission_templates.edit')
  const canDelete = hasPermission('permission_templates.delete')

  const [templates, setTemplates] = useState([])
  const [groups, setGroups] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(null) // {id, name} for one row, or 'bulk'
  const [bulkIds, setBulkIds] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => { templatesAPI.getNodes().then(({ data }) => setGroups(data.groups)).catch(() => toast.error('Failed to load the permission catalogue')) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await templatesAPI.list()
      const list = data.templates || data
      setTemplates(list)
      setBulkIds(prev => new Set([...prev].filter(id => list.some(t => t.id === id))))
    }
    catch { toast.error('Failed to load templates') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const del = async (id) => {
    try { await templatesAPI.delete(id); toast.success('Template deleted'); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Failed') }
    setConfirmingDelete(null)
  }

  const toggleBulk = (id) => setBulkIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleBulkAll = () => setBulkIds(prev => prev.size === templates.length ? new Set() : new Set(templates.map(t => t.id)))
  const deleteBulk = async () => {
    setBulkBusy(true)
    try {
      const ids = [...bulkIds]
      const results = await Promise.allSettled(ids.map(id => templatesAPI.delete(id)))
      const failed = results.filter(r => r.status === 'rejected').length
      if (failed === 0) toast.success(`${ids.length} template(s) deleted`)
      else toast.error(`${ids.length - failed} deleted, ${failed} failed`)
      setBulkIds(new Set()); setConfirmingDelete(null); load()
    } finally { setBulkBusy(false) }
  }
  const save = async (form) => {
    setSaving(true)
    try {
      if (form.id) { await templatesAPI.update(form.id, form); toast.success('Template updated') }
      else { await templatesAPI.create(form); toast.success('Template created') }
      setEditing(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Save failed') } finally { setSaving(false) }
  }

  if (editing !== null) {
    return <TemplateForm initial={editing === 'new' ? null : editing} groups={groups} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Permission Templates"
        sub="Reusable permission sets that can be applied to user accounts."
        action={canCreate && <PrimaryButton onClick={() => setEditing('new')} icon={<Icon name="plus" size={14} />}>New Template</PrimaryButton>}
      />

      {confirmingDelete && (
        <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 flex items-center gap-3">
          <Icon name="alertCircle" size={16} className="text-red-500 shrink-0" />
          <div className="text-sm font-semibold text-red-700 flex-1">
            {confirmingDelete === 'bulk' ? `Delete ${bulkIds.size} template(s)?` : `Delete template "${confirmingDelete.name}"?`}
          </div>
          <SecondaryButton onClick={() => setConfirmingDelete(null)}>Cancel</SecondaryButton>
          <SecondaryButton tone="danger" disabled={bulkBusy}
            onClick={() => confirmingDelete === 'bulk' ? deleteBulk() : del(confirmingDelete.id)}>
            {bulkBusy ? 'Deleting…' : 'Confirm Delete'}
          </SecondaryButton>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <DataTable
          columns={[
            { key: 'name', label: 'Name', sortable: true, render: r => <span className="font-semibold text-slate-800">{r.name}</span> },
            { key: 'description', label: 'Description', render: r => <span className="text-slate-500">{r.description || '—'}</span> },
            { key: 'nodes', label: 'Permissions', align: 'right', render: r => `${r.nodes?.length || 0}` },
            { key: 'actions', label: '', render: r => (
              <div className="flex justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                {canEdit && <SecondaryButton onClick={() => setEditing(r)} icon={<Icon name="edit" size={12} />}>Edit</SecondaryButton>}
                {canDelete && <SecondaryButton tone="danger" onClick={() => setConfirmingDelete({ id: r.id, name: r.name })} icon={<Icon name="trash" size={12} />}>Delete</SecondaryButton>}
              </div>
            ), align: 'right' },
          ]}
          rows={templates}
          loading={loading}
          searchKeys={['name', 'description']}
          selection={canDelete ? { selectedIds: bulkIds, onToggle: toggleBulk, onToggleAll: toggleBulkAll } : undefined}
          bulkActions={canDelete ? [
            { key: 'delete', label: 'Delete', tone: 'danger', icon: <Icon name="trash" size={14} />, onClick: () => setConfirmingDelete('bulk') },
          ] : undefined}
          emptyTitle="No templates yet"
          emptyBody="Create templates to quickly assign permission sets to users."
        />
      </div>
    </div>
  )
}
