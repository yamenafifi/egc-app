import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Icon } from '@/components/Icons'
import { erpAPI } from '@/services/api'
import { PageHeader, PrimaryButton } from '@/desktop/components/Page'
import DataTable from '@/desktop/components/DataTable'
import Drawer from '@/desktop/components/Drawer'

function EditSupervisorsDrawer({ project, onClose, onSaved }) {
  const [search, setSearch] = useState('')
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (project) setSelected(new Set(project.supervisors || [])) }, [project])

  const runSearch = useCallback(async () => {
    setLoading(true)
    try { const { data } = await erpAPI.listEmployees({ search, page_length: 30 }); setEmployees(data.employees || []) }
    catch { toast.error('Failed to search employees') } finally { setLoading(false) }
  }, [search])
  useEffect(() => { if (project) runSearch() }, [project, runSearch])

  if (!project) return null

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleSave = async () => {
    setSaving(true)
    try { await erpAPI.updateProjectSupervisors(project.name, [...selected]); toast.success('Supervisors updated'); onSaved(); onClose() }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to update supervisors') } finally { setSaving(false) }
  }

  // Keep already-assigned supervisors visible/toggleable even if the current
  // search term would otherwise filter them out of the ERP results.
  const known = new Map((project.supervisors || []).map((id, i) => [id, project.supervisor_names?.[i] || id]))
  employees.forEach(e => known.set(e.name, e.employee_name))
  const rows = [...known.entries()].map(([id, name]) => ({ id, name }))

  return (
    <Drawer open={!!project} onClose={onClose} title={`Supervisors — ${project.project_name}`}>
      <div className="relative mb-3">
        <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg" />
      </div>
      <div className="text-xs text-slate-400 mb-2">{selected.size} selected</div>
      <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto desktop-scrollbar mb-4">
        {loading ? (
          <div className="text-sm text-slate-400 py-3">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-400 py-3">No employees found.</div>
        ) : rows.map(row => (
          <label key={row.id} className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer ${selected.has(row.id) ? 'bg-blue-50' : 'bg-slate-50'}`}>
            <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800">{row.name}</div>
              <div className="text-xs text-slate-400">{row.id}</div>
            </div>
          </label>
        ))}
      </div>
      <PrimaryButton onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Supervisors'}</PrimaryButton>
    </Drawer>
  )
}

export default function ProjectSupervisorsPage() {
  const [sites, setSites] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try { const { data } = await erpAPI.projectSites(); setSites(data.sites || []) }
    catch { toast.error('Failed to load project sites'); setSites([]) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Project Supervisors" sub="Assign who can approve attendance submissions for each project site." />
      <div className="flex-1 min-h-0">
        <DataTable
          columns={[
            { key: 'project_name', label: 'Project', sortable: true },
            { key: 'supervisor_names', label: 'Supervisors', render: r => r.supervisor_names?.length ? r.supervisor_names.join(', ') : <span className="text-slate-400">No supervisors assigned</span> },
          ]}
          rows={sites || []}
          loading={sites === null}
          keyField="name"
          searchKeys={['project_name']}
          onRowClick={setEditing}
          emptyTitle="No active project sites found"
        />
      </div>
      <EditSupervisorsDrawer project={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  )
}
