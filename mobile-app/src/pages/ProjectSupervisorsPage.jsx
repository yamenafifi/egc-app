import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import BottomSheet from '@/components/ui/BottomSheet'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { erpAPI } from '@/services/api'

function EditSupervisorsSheet({ project, onClose, onSaved }) {
  const [search, setSearch] = useState('')
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (project) setSelected(new Set(project.supervisors || []))
  }, [project])

  const runSearch = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await erpAPI.listEmployees({ search, page_length: 30 })
      setEmployees(data.employees || [])
    } catch {
      toast.error('Failed to search employees')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { if (project) runSearch() }, [project, runSearch])

  if (!project) return null

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      await erpAPI.updateProjectSupervisors(project.name, [...selected])
      toast.success('Supervisors updated')
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update supervisors')
    } finally {
      setSaving(false)
    }
  }

  // Keep already-assigned supervisors visible/toggleable even if the
  // current search term would otherwise filter them out of the ERP results.
  const known = new Map((project.supervisors || []).map((id, i) => [id, project.supervisor_names?.[i] || id]))
  employees.forEach(e => known.set(e.name, e.employee_name))
  const rows = [...known.entries()].map(([id, name]) => ({ id, name }))

  return (
    <BottomSheet open={!!project} onClose={onClose} title={`Supervisors — ${project.project_name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <Icon name="search" size={14} color={c.textMuted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
            style={{ width: '100%', padding: '10px 14px 10px 36px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 13, fontFamily: c.font, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ fontSize: 11, color: c.textMuted }}>{selected.size} selected</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ fontSize: 12, color: c.textMuted, padding: '12px 0' }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 12, color: c.textMuted, padding: '12px 0' }}>No employees found.</div>
          ) : rows.map(row => (
            <label key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: selected.has(row.id) ? c.primaryBg : c.bg, borderRadius: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: c.text }}>{row.name}</div>
                <div style={{ fontSize: 10, color: c.textMuted }}>{row.id}</div>
              </div>
            </label>
          ))}
        </div>

        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', padding: '11px', borderRadius: 9, border: 'none',
          background: c.primaryDark, color: '#fff', fontFamily: c.font, fontSize: 13, fontWeight: 700,
          cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1,
        }}>
          {saving ? 'Saving…' : 'Save Supervisors'}
        </button>
      </div>
    </BottomSheet>
  )
}

export default function ProjectSupervisorsPage() {
  const isMobile = useIsMobile()
  const [sites, setSites] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try {
      const { data } = await erpAPI.projectSites()
      setSites(data.sites || [])
    } catch {
      toast.error('Failed to load project sites')
      setSites([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const body = (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {sites === null ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
        ) : sites.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>No active project sites found.</div>
        ) : sites.map(site => (
          <button key={site.name} onClick={() => setEditing(site)} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: '13px 16px', background: 'none', border: 'none',
            borderBottom: `1px solid ${c.bg}`, cursor: 'pointer', textAlign: 'left', fontFamily: c.font,
          }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="mapPin" size={15} color={c.textSub} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{site.project_name}</div>
              <div style={{ fontSize: 11, color: c.textMuted, marginTop: 1 }}>
                {site.supervisor_names?.length ? site.supervisor_names.join(', ') : 'No supervisors assigned'}
              </div>
            </div>
            <Icon name="chevronRight" size={14} color={c.textMuted} style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Project Supervisors" />
        <div style={{ padding: '20px 16px 40px' }}>{body}</div>
        <EditSupervisorsSheet project={editing} onClose={() => setEditing(null)} onSaved={load} />
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Project Supervisors</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>Assign who can approve attendance submissions for each project site.</p>
      </div>
      {body}
      <EditSupervisorsSheet project={editing} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  )
}
