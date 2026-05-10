import { useState, useEffect, useCallback } from 'react'
import { templatesAPI } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { Icon } from '@/components/Icons'
import { c as th } from '@/theme'
import toast from 'react-hot-toast'

const ALL_NODES = {
  'users.view_list':'View all user accounts','users.create':'Create a new user account',
  'users.edit':'Edit user details','users.deactivate':'Deactivate / reactivate users',
  'users.reset_password':'Reset user password','users.view_permissions':'View user permissions',
  'users.edit_permissions':'Edit user permissions','users.assign_template':'Assign permission template',
  'erp.view_employee_list':'View employee list from ERPNext','erp.sync_employee':'Sync employee from ERPNext',
  'permission_templates.view':'View templates','permission_templates.create':'Create templates',
  'permission_templates.edit':'Edit templates','permission_templates.delete':'Delete templates',
  'timesheet.view_own':'View own timesheet entries','timesheet.view_all':'View all timesheets',
  'timesheet.add_record':'Clock in/out (QR) or add manual entry','timesheet.edit_own':'Edit own entries',
  'timesheet.edit_all':'Edit all entries','timesheet.delete_own':'Delete own entries',
  'timesheet.delete_all':'Delete all entries','timesheet.approve':'Approve submissions',
  'timesheet.submit_to_erp':'Push approved submissions to ERPNext',
  'system.view_audit_log':'View audit log','system.manage_settings':'Manage system-wide settings (QR toggle etc.)',
}

const GROUPS = [
  { label: 'Users',                icon: 'users',    prefix: 'users.' },
  { label: 'ERP',                  icon: 'link',     prefix: 'erp.' },
  { label: 'Permission Templates',    icon: 'shield',   prefix: 'permission_templates.' },
  { label: 'Timesheets',           icon: 'clock',    prefix: 'timesheet.' },
  { label: 'System',               icon: 'key',      prefix: 'system.' },
]

export default function PermissionTemplatesPage() {
  const { hasPermission } = useAuth()
  const { t } = useLang()
  const canCreate = hasPermission('permission_templates.create')
  const canEdit   = hasPermission('permission_templates.edit')
  const canDelete = hasPermission('permission_templates.delete')

  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await templatesAPI.list()
      setTemplates(data.templates || data)
    } catch { toast.error('Failed to load templates') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const del = async (id, name) => {
    if (!confirm(`Delete template "${name}"?`)) return
    try { await templatesAPI.delete(id); toast.success('Template deleted'); load() }
    catch (err) { toast.error(err.response?.data?.error || 'Failed') }
  }

  const save = async (form) => {
    setSaving(true)
    try {
      if (form.id) { await templatesAPI.update(form.id, form); toast.success('Template updated') }
      else         { await templatesAPI.create(form); toast.success('Template created') }
      setEditing(null); load()
    } catch (err) { toast.error(err.response?.data?.error || 'Save failed') }
    finally { setSaving(false) }
  }

  if (editing !== null) {
    return <TemplateForm initial={editing === 'new' ? null : editing} onSave={save} onCancel={() => setEditing(null)} saving={saving} />
  }

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <div>
          <h1 style={S.title}>Permission Templates</h1>
          <p style={S.sub}>Reusable permission sets that can be applied to user accounts</p>
        </div>
        {canCreate && (
          <button style={S.primaryBtn} onClick={() => setEditing('new')}>
            <Icon name="plus" size={14} color="#fff" />
            <span>New Template</span>
          </button>
        )}
      </div>

      {loading ? (
        <div style={S.loading}><Icon name="activity" size={20} color={th.textMuted} /><span>Loading…</span></div>
      ) : templates.length === 0 ? (
        <div style={S.empty}>
          <div style={S.emptyIconWrap}><Icon name="shield" size={28} color={th.borderStrong} /></div>
          <div style={S.emptyTitle}>No templates yet</div>
          <div style={S.emptyText}>Create templates to quickly assign permission sets to users.</div>
          {canCreate && (
            <button style={S.primaryBtn} onClick={() => setEditing('new')}>
              <Icon name="plus" size={14} color="#fff" /><span>Create First Template</span>
            </button>
          )}
        </div>
      ) : (
        <div style={S.grid}>
          {templates.map(tmpl => (
            <div key={tmpl.id} style={S.card}>
              <div style={S.cardHeader}>
                <div style={S.cardIconWrap}><Icon name="shield" size={16} color={th.purple} /></div>
                <div style={S.cardMeta}>
                  <div style={S.cardName}>{tmpl.name}</div>
                  <div style={S.cardCount}>{tmpl.nodes?.length || 0} permissions</div>
                </div>
              </div>
              {tmpl.description && <div style={S.cardDesc}>{tmpl.description}</div>}
              <div style={S.tags}>
                {(tmpl.nodes || []).slice(0,5).map(n => (
                  <span key={n} style={S.tag}>{n.split('.').slice(-1)[0].replace(/_/g,' ')}</span>
                ))}
                {(tmpl.nodes || []).length > 5 && (
                  <span style={{ ...S.tag, background: th.bg, color: th.textMuted }}>+{tmpl.nodes.length - 5}</span>
                )}
              </div>
              <div style={S.cardFooter}>
                {canEdit && (
                  <button style={S.actionBtn} onClick={() => setEditing(tmpl)}>
                    <Icon name="edit" size={12} color={th.textSub} />Edit
                  </button>
                )}
                {canDelete && (
                  <button style={{ ...S.actionBtn, color: th.red }} onClick={() => del(tmpl.id, tmpl.name)}>
                    <Icon name="trash" size={12} color={th.red} />Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateForm({ initial, onSave, onCancel, saving }) {
  const { t } = useLang()
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.description || '')
  const [nodes, setNodes] = useState(new Set(initial?.nodes || []))

  const toggle = n => setNodes(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })
  const toggleGroup = prefix => {
    const gn = Object.keys(ALL_NODES).filter(n => n.startsWith(prefix))
    const allOn = gn.every(n => nodes.has(n))
    setNodes(prev => { const s = new Set(prev); gn.forEach(n => allOn ? s.delete(n) : s.add(n)); return s })
  }

  const handleSave = () => {
    if (!name.trim()) return toast.error('Name is required')
    if (!nodes.size)  return toast.error('Select at least one permission')
    onSave({ id: initial?.id, name: name.trim(), description: desc.trim(), nodes: [...nodes] })
  }

  return (
    <div style={S.page}>
      <button style={S.backBtn} onClick={onCancel}>
        <Icon name="chevronLeft" size={14} color={th.textMuted} />Back to templates
      </button>
      <h2 style={{ ...S.title, marginBottom: 20 }}>{initial ? t('edit_template') : t('new_template')}</h2>

      <div style={S.formCard}>
        <div style={F.row}>
          <div style={F.field}>
            <label style={F.label}>Template Name *</label>
            <input style={F.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Site Supervisor, Office Staff" />
          </div>
          <div style={F.field}>
            <label style={F.label}>Description</label>
            <input style={F.input} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What role is this template for?" />
          </div>
        </div>

        <div style={F.divider} />

        <div style={F.permHeader}>
          <div style={F.permTitle}>Permissions</div>
          <div style={F.permCount}>{nodes.size} selected</div>
        </div>

        <div style={F.groups}>
          {GROUPS.map(g => {
            const gNodes = Object.keys(ALL_NODES).filter(n => n.startsWith(g.prefix))
            const allOn = gNodes.every(n => nodes.has(n))
            const someOn = gNodes.some(n => nodes.has(n))
            return (
              <div key={g.prefix} style={F.group}>
                <div style={F.groupHeader}>
                  <div style={F.groupLeft}>
                    <Icon name={g.icon} size={13} color={someOn ? th.navyMid : th.textMuted} />
                    <span style={{ ...F.groupName, color: someOn ? th.text : th.textSub }}>{g.label}</span>
                    {someOn && <span style={F.groupBadge}>{gNodes.filter(n => nodes.has(n)).length}/{gNodes.length}</span>}
                  </div>
                  <button style={F.toggleBtn} onClick={() => toggleGroup(g.prefix)}>
                    {allOn ? t('deselect_all_perms') : t('select_all_perms')}
                  </button>
                </div>
                <div style={F.nodeGrid}>
                  {gNodes.map(n => (
                    <label key={n} style={{ ...F.nodeRow, ...(nodes.has(n) ? F.nodeRowOn : {}) }}>
                      <input type="checkbox" checked={nodes.has(n)} onChange={() => toggle(n)} style={{ flexShrink: 0 }} />
                      <div>
                        <div style={F.nodeName}>{n.split('.').slice(-1)[0].replace(/_/g, ' ')}</div>
                        <div style={F.nodeDesc}>{ALL_NODES[n]}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div style={F.actions}>
          <button style={F.cancelBtn} onClick={onCancel}>Cancel</button>
          <button style={{ ...F.saveBtn, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : initial ? t('save_changes') : t('create_template')}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  page: {width:'100%',animation:'fadeIn 0.2s ease'},
  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: th.text },
  sub: { margin: 0, fontSize: 13, color: th.textSub },
  primaryBtn: {display:'flex',alignItems:'center',gap:7,padding:'10px 18px',background:th.primary,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:th.font,boxShadow:`0 2px 6px ${th.primary}40`},
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 48, color: th.textMuted, fontSize: 14 },
  empty: {
    textAlign: 'center', padding: '64px 32px',
    background: th.surface, borderRadius: 12, border: `1px solid ${th.border}`,
  },
  emptyIconWrap: {
    width: 56, height: 56, borderRadius: 14, background: th.bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '0 auto 16px',
  },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: th.text, marginBottom: 8 },
  emptyText: { fontSize: 13, color: th.textSub, marginBottom: 20, lineHeight: 1.6 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 },
  card: {
    background: th.surface, borderRadius: 10, padding: 18,
    border: `1px solid ${th.border}`, boxShadow: th.sm,
  },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  cardIconWrap: {
    width: 32, height: 32, borderRadius: 8, background: th.purpleBg,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardMeta: { flex: 1 },
  cardName: { fontSize: 14, fontWeight: 700, color: th.text },
  cardCount: { fontSize: 11, color: th.textMuted, marginTop: 1 },
  cardDesc: { fontSize: 12, color: th.textSub, marginBottom: 10, lineHeight: 1.5 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 },
  tag: {
    fontSize: 10, padding: '2px 8px', borderRadius: 10,
    background: '#F0F4F8', color: th.textSub,
    textTransform: 'capitalize', fontWeight: 500,
  },
  cardFooter: { display: 'flex', gap: 8, paddingTop: 10, borderTop: `1px solid ${th.bg}` },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', background: 'none', border: `1px solid ${th.border}`,
    borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
    color: th.textSub,
  },
  backBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'none', border: 'none', color: th.textMuted,
    fontSize: 13, cursor: 'pointer', padding: '0 0 16px',
  },
  formCard: {
    background: th.surface, borderRadius: 12,
    border: `1px solid ${th.border}`, overflow: 'hidden',
    boxShadow: th.sm, maxWidth: 760,
  },
}

const F = {
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '20px 24px' },
  field: {},
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: th.textSub, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 },
  input: {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: `1.5px solid ${th.border}`, fontSize: 13, color: th.text,
    outline: 'none', background: '#FAFBFC', boxSizing: 'border-box',
  },
  divider: { height: 1, background: th.border },
  permHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px 12px',
  },
  permTitle: { fontSize: 13, fontWeight: 700, color: th.text },
  permCount: {
    fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
    background: th.blueBg, color: th.blue,
  },
  groups: { padding: '0 24px 20px', display: 'flex', flexDirection: 'column', gap: 10 },
  group: { border: `1px solid ${th.border}`, borderRadius: 8, overflow: 'hidden' },
  groupHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', background: '#F8FAFC',
  },
  groupLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  groupName: { fontSize: 12, fontWeight: 700 },
  groupBadge: {
    fontSize: 10, padding: '1px 7px', borderRadius: 10,
    background: th.navyMid, color: '#fff', fontWeight: 700,
  },
  toggleBtn: {
    background: 'none', border: 'none', fontSize: 11,
    color: th.blue, cursor: 'pointer', fontWeight: 600,
  },
  nodeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr' },
  nodeRow: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '9px 14px', cursor: 'pointer',
    borderBottom: `1px solid ${th.bg}`, borderRight: `1px solid ${th.bg}`,
  },
  nodeRowOn: { background: '#F0F6FF' },
  nodeName: { fontSize: 12, fontWeight: 600, color: th.text, textTransform: 'capitalize' },
  nodeDesc: { fontSize: 11, color: th.textMuted, marginTop: 1, lineHeight: 1.3 },
  actions: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '16px 24px', borderTop: `1px solid ${th.border}`,
  },
  cancelBtn: {
    padding: '9px 18px', background: th.surface, color: th.textSub,
    border: `1.5px solid ${th.border}`, borderRadius: 8,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  saveBtn: {display:'flex',alignItems:'center',gap:7,padding:'10px 18px',background:th.primary,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:th.font,boxShadow:`0 2px 6px ${th.primary}40`},
}
