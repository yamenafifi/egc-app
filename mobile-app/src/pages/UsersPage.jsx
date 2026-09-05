import { useState, useEffect, useCallback, lazy } from 'react'
import { useNavigate } from 'react-router-dom'
import { usersAPI, erpAPI, templatesAPI } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { useBreadcrumb } from '@/components/layout/AppLayout'
import { useLang } from '@/context/LangContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import toast from 'react-hot-toast'
const DesktopUsersPage = lazy(() => import('@/pages/desktop/UsersPage')) // see App.jsx's top comment - split out of the initial bundle

// ── Shared helpers ────────────────────────────────────────────────────────────
const initials = n => n?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'
const fmtDate  = iso => !iso ? 'Never' : new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})

function Badge({ type, children }) {
  const map = {
    active:   {bg:c.greenBg,  color:c.green,  border:c.greenBorder},
    inactive: {bg:c.redBg,    color:c.red,    border:c.redBorder},
    linked:   {bg:c.blueBg,   color:c.blue,   border:c.blueBorder},
    admin:    {bg:c.orangeBg, color:c.orange, border:c.orangeBorder},
    neutral:  {bg:c.bg,       color:c.textMuted,border:c.border},
  }
  const s = map[type]||map.neutral
  return <span style={{display:'inline-block',padding:'2px 9px',borderRadius:20,fontSize:11,fontWeight:700,background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>{children}</span>
}

// ── User Detail / Edit page ───────────────────────────────────────────────────
function UserDetailPage({ userId, onBack, onChanged }) {
  const { hasPermission } = useAuth()
  const { t } = useLang()
  const { setExtra } = useBreadcrumb()
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
        usersAPI.get(userId),
        usersAPI.getPermissions(userId),
        templatesAPI.list(),
        usersAPI.getDevices(userId).catch(() => ({ data: { devices: [] } })),
      ])
      setUser(uRes.data.user)
      setPerms(pRes.data)
      setLocalPerms(pRes.data.permissions || [])
      setTemplates(tRes.data.templates || [])
      setDevices(dRes.data.devices || [])
      setExtra([{ label: uRes.data.user.display_name }])
    } catch { toast.error('Failed to load user') }
    finally { setLoading(false) }
  }, [userId])

  const handleSavePermissions = async () => {
    setSavingPerms(true)
    try {
      await usersAPI.updatePermissions(userId, localPerms)
      toast.success('Permissions updated')
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to update permissions') }
    finally { setSavingPerms(false) }
  }

  useEffect(() => { load() }, [load])

  const toggleActive = async () => {
    try {
      if (user.is_active) await usersAPI.deactivate(userId)
      else await usersAPI.reactivate(userId)
      toast.success(user.is_active ? 'Account deactivated' : 'Account reactivated')
      load(); onChanged()
    } catch (e) { toast.error(e.response?.data?.error||'Failed') }
  }

  const handleResetPw = async () => {
    if (newPw.length < 8) return toast.error('Password must be at least 8 characters')
    setPwLoading(true)
    try {
      await usersAPI.resetPassword(userId, newPw)
      toast.success('Password reset successfully')
      setEditingPw(false); setNewPw('')
    } catch (e) { toast.error(e.response?.data?.error||'Failed') }
    finally { setPwLoading(false) }
  }

  const handleApplyTemplate = async (templateId) => {
    if (!templateId) return
    try {
      await templatesAPI.apply(templateId, userId)
      toast.success('Template applied')
      load()
    } catch (e) { toast.error(e.response?.data?.error||'Failed') }
  }

  const handleDelete = async () => {
    try {
      await usersAPI.delete(userId)
      toast.success('Account permanently deleted')
      onBack()
      onChanged()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete account')
    }
    setDeleteConfirm(false)
  }

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:64,gap:10,color:c.textMuted}}>
      <div style={{width:24,height:24,border:`2px solid ${c.primaryBg}`,borderTopColor:c.primary,borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/>
      Loading…
    </div>
  )
  if (!user) return null

  return (
    <div style={D.page}>
      <button style={D.backBtn} onClick={onBack}>
        <Icon name="arrowLeft" size={14} color={c.textMuted}/> Back to users
      </button>

      {/* Header */}
      <div style={D.header}>
        <div style={D.headerLeft}>
          <div style={D.bigAvatar}>{initials(user.display_name)}</div>
          <div>
            <h1 style={D.name}>{user.display_name}</h1>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:6}}>
              <Badge type={user.is_active?'active':'inactive'}>{user.is_active?'Active':'Inactive'}</Badge>
              {user.is_sysadmin && <Badge type="admin">System Admin</Badge>}
              {user.erp_linked && <Badge type="linked">ERP Linked</Badge>}
            </div>
          </div>
        </div>
        <div style={D.headerActions}>
          {!user.is_sysadmin && hasPermission('users.deactivate') && (
            <button style={user.is_active ? D.deactivateBtn : D.activateBtn} onClick={toggleActive}>
              <Icon name={user.is_active?'xCircle':'checkCircle'} size={14} color={user.is_active?c.red:c.green}/>
              {user.is_active ? t('deactivate') : t('reactivate')}
            </button>
          )}
          {!user.is_sysadmin && (
            !deleteConfirm ? (
              <button style={D.deleteBtn} onClick={() => setDeleteConfirm(true)}>
                <Icon name="trash" size={14} color={c.red}/> Delete Account
              </button>
            ) : (
              <div style={D.deleteConfirm}>
                <span style={{fontSize:12,color:c.red,fontWeight:600}}>Confirm delete?</span>
                <button style={{...D.deleteBtn,padding:'6px 12px'}} onClick={handleDelete}>Yes, Delete</button>
                <button style={D.cancelBtn} onClick={() => setDeleteConfirm(false)}>Cancel</button>
              </div>
            )
          )}
        </div>
      </div>

      <div style={D.grid}>
        {/* Account details */}
        <div style={D.card}>
          <div style={D.cardTitle}><Icon name="user" size={14} color={c.primary}/> Account Details</div>
          <div style={D.infoGrid}>
            {[
              ['Username', <code style={D.code}>{user.username}</code>],
              ['Display Name', user.display_name],
              ['ERP Employee ID', user.erp_employee_id || '—'],
              ['IQAMA Number', user.iqama_number || '—'],
              ['Last Login', fmtDate(user.last_login)],
              ['Created', fmtDate(user.created_at)],
            ].map(([k, v]) => (
              <div key={k} style={D.infoRow}>
                <div style={D.infoKey}>{k}</div>
                <div style={D.infoVal}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Password reset */}
        {hasPermission('users.reset_password') && (
          <div style={D.card}>
            <div style={D.cardTitle}><Icon name="key" size={14} color={c.primary}/> Password Management</div>
            {!editingPw ? (
              <div>
                <p style={{fontSize:13,color:c.textSub,marginBottom:14,lineHeight:1.6}}>
                  Reset this user's password. They will be required to change it on next login.
                </p>
                <button style={D.outBtn} onClick={() => setEditingPw(true)}>
                  <Icon name="key" size={13} color={c.textSub}/> Reset Password
                </button>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <input style={D.input} type="password" placeholder="New password (min 8 chars)"
                  value={newPw} onChange={e => setNewPw(e.target.value)} autoFocus />
                <div style={{display:'flex',gap:8}}>
                  <button style={D.primaryBtn} onClick={handleResetPw} disabled={pwLoading}>
                    {pwLoading ? 'Resetting…' : 'Set Password'}
                  </button>
                  <button style={D.cancelBtn} onClick={() => { setEditingPw(false); setNewPw('') }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Apply permission template */}
        {hasPermission('users.assign_template') && templates.length > 0 && (
          <div style={D.card}>
            <div style={D.cardTitle}><Icon name="shield" size={14} color={c.primary}/> Apply Permission Template</div>
            <p style={{fontSize:13,color:c.textSub,marginBottom:12,lineHeight:1.6}}>
              Applying a template replaces this user's current permissions.
              {user.permission_template && <span style={{color:c.textMuted}}> Currently using: <strong>{templates.find(t=>t.id===user.permission_template)?.name||'Unknown'}</strong></span>}
            </p>
            <select style={D.select} defaultValue="" onChange={e => handleApplyTemplate(e.target.value)}>
              <option value="" disabled>Select a template to apply…</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.nodes?.length||0} permissions)</option>
              ))}
            </select>
          </div>
        )}

        {/* Devices */}
        {hasPermission('users.view_permissions') && devices && (
          <div style={{...D.card, gridColumn:'1 / -1'}}>
            <div style={D.cardTitle}><Icon name="monitor" size={14} color={c.primary}/> Devices & Sessions ({devices.length})</div>
            {devices.length === 0 ? (
              <div style={{fontSize:13,color:c.textMuted}}>No devices recorded for this user.</div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:8}}>
                {devices.map(d => (
                  <div key={d.id} style={{padding:12,border:`1px solid ${c.border}`,borderRadius:8,background:c.surfaceRaised}}>
                    <div style={{fontSize:13,fontWeight:700,color:c.text,marginBottom:4}}>{d.extra_info?.platform || 'Unknown Device'}</div>
                    <div style={{fontSize:11,color:c.textMuted}}>IP: {d.last_ip || '—'}</div>
                    <div style={{fontSize:11,color:c.textMuted}}>Screen: {d.extra_info?.screen || '—'}</div>
                    <div style={{fontSize:11,color:c.textMuted}}>TZ: {d.extra_info?.timezone || '—'}</div>
                    <div style={{fontSize:11,color:c.textMuted,marginTop:4,fontWeight:600}}>Last active: {fmtDate(d.last_active)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Permissions */}
        {hasPermission('users.view_permissions') && perms && (
          <div style={{...D.card, gridColumn:'1 / -1'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,paddingBottom:10,borderBottom:`1px solid ${c.bg}`}}>
              <div style={{display:'flex',alignItems:'center',gap:7,fontSize:13,fontWeight:700,color:c.text}}><Icon name="shield" size={14} color={c.primary}/> Custom Permissions ({(localPerms||[]).length})</div>
              {hasPermission('users.edit_permissions') && !user.is_sysadmin && (
                <button style={{...D.primaryBtn,padding:'6px 12px',fontSize:12}} onClick={handleSavePermissions} disabled={savingPerms}>
                  {savingPerms ? 'Saving…' : 'Save Permissions'}
                </button>
              )}
            </div>
            {user.is_sysadmin ? (
              <div style={{fontSize:13,color:c.green,fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                <Icon name="checkCircle" size={14} color={c.green}/> System administrator — has all permissions
              </div>
            ) : (
              <div style={D.permGrid}>
                {Object.entries(perms.all_nodes||{}).map(([node, desc]) => {
                  const has = localPerms.includes(node)
                  const canEdit = hasPermission('users.edit_permissions')
                  return (
                    <div key={node} 
                         style={{...D.permRow,...(has?D.permRowOn:{}),cursor:canEdit?'pointer':'default'}}
                         onClick={() => {
                           if (!canEdit) return
                           setLocalPerms(prev => has ? prev.filter(p => p !== node) : [...prev, node])
                         }}>
                      <div style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${has?c.green:c.borderStrong}`,background:has?c.green:c.surfaceRaised,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2}}>
                        {has && <Icon name="check" size={12} color="#fff"/>}
                      </div>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:has?c.text:c.textMuted,fontFamily:c.mono}}>{node}</div>
                        <div style={{fontSize:11,color:c.textMuted,lineHeight:1.4}}>{desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Create Account multi-step form ───────────────────────────────────────────
function CreateModal({ onClose, onCreated }) {
  const { t } = useLang()
  const [step, setStep] = useState(1) // 1: employee, 2: password+template
  const [employees, setEmployees] = useState([])
  const [erpSearch, setErpSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [erpLoading, setErpLoading] = useState(false)
  const [form, setForm] = useState({ password:'', confirm:'', templateId:'' })
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    templatesAPI.list().then(r => setTemplates(r.data.templates||[])).catch(()=>{})
  }, [])

  const searchERP = useCallback(async () => {
    setErpLoading(true)
    try {
      const {data} = await erpAPI.listEmployees({search:erpSearch, page_length:20})
      setEmployees(data.employees||[])
    } catch { toast.error('Failed to fetch from ERPNext') }
    finally { setErpLoading(false) }
  }, [erpSearch])

  useEffect(() => { searchERP() }, [searchERP])

  const handleCreate = async () => {
    if (!form.password || form.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (form.password !== form.confirm) return toast.error('Passwords do not match')
    setLoading(true)
    try {
      const {data} = await usersAPI.create(selected.name, form.password)
      // Apply template if selected
      if (form.templateId && data.user?.id) {
        try { await templatesAPI.apply(form.templateId, data.user.id) } catch {}
      }
      toast.success(`Account created for ${selected.employee_name}`)
      onCreated()
    } catch (e) { toast.error(e.response?.data?.error||'Failed to create account') }
    finally { setLoading(false) }
  }

  return (
    <div style={MD.overlay} onClick={onClose}>
      <div style={MD.modal} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={MD.header}>
          <div>
            <h2 style={MD.title}>Create User Account</h2>
            <p style={MD.sub}>Step {step} of 2 — {step===1?'Select Employee':'Set Credentials & Role'}</p>
          </div>
          <button style={MD.closeBtn} onClick={onClose}><Icon name="x" size={18} color={c.textMuted}/></button>
        </div>

        {/* Step indicator */}
        <div style={MD.steps}>
          {[{n:1,label:'Employee'},{n:2,label:'Credentials'}].map(s => (
            <div key={s.n} style={{...MD.step,...(step>=s.n?MD.stepActive:{})}}>
              <div style={{...MD.stepNum,...(step>=s.n?MD.stepNumActive:{})}}>{step>s.n?<Icon name="check" size={10} color="#fff"/>:s.n}</div>
              <span style={{fontSize:12,fontWeight:600,color:step>=s.n?c.primary:c.textMuted}}>{s.label}</span>
            </div>
          ))}
          <div style={MD.stepLine}/>
        </div>

        {/* Body */}
        <div style={MD.body}>
          {step === 1 && (
            <>
              <div style={MD.field}>
                <label style={MD.label}>Search ERPNext Employees</label>
                <div style={{position:'relative'}}>
                  <Icon name="search" size={14} color={c.textMuted} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/>
                  <input style={{...MD.input,paddingLeft:36}} placeholder="Search by name or Employee ID…" value={erpSearch} onChange={e=>setErpSearch(e.target.value)} autoFocus/>
                </div>
              </div>
              <div style={MD.list}>
                {erpLoading ? (
                  <div style={MD.listMsg}><Icon name="activity" size={14} color={c.textMuted}/>Loading from ERPNext…</div>
                ) : employees.length===0 ? (
                  <div style={MD.listMsg}>No employees found.</div>
                ) : employees.map(emp => {
                  const isLinked = emp.custom_portal_account_status === 'Account Linked'
                  const isSel = selected?.name === emp.name
                  return (
                    <div key={emp.name}
                      style={{...MD.empRow,...(isSel?MD.empRowActive:{}),...(isLinked?{opacity:0.5}:{})}}
                      onClick={() => !isLinked && setSelected(emp)}>
                      <div style={MD.empAvatar}>{initials(emp.employee_name)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:c.text}}>{emp.employee_name}</div>
                        <div style={{fontSize:11,color:c.textMuted,marginTop:1}}>
                          {emp.name}{emp.designation&&` · ${emp.designation}`}{emp.department&&` · ${emp.department}`}
                        </div>
                      </div>
                      <div>
                        {isLinked
                          ? <span style={{fontSize:10,color:c.blue,fontWeight:700,display:'flex',alignItems:'center',gap:3}}><Icon name="checkCircle" size={11} color={c.blue}/>Linked</span>
                          : isSel && <Icon name="check" size={16} color={c.primary}/>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {selected && (
                <div style={MD.selectedBanner}>
                  <Icon name="user" size={13} color={c.primary}/>
                  <div style={{flex:1}}>
                    <span style={{fontWeight:700,color:c.text}}>{selected.employee_name}</span>
                    <span style={{color:c.textMuted}}> · {selected.name}</span>
                    {selected.custom_iqama_number&&<span style={{color:c.textMuted}}> · IQAMA: <code style={{fontFamily:c.mono}}>{selected.custom_iqama_number}</code></span>}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              {/* Selected employee recap */}
              <div style={{...MD.selectedBanner,marginBottom:4}}>
                <Icon name="user" size={13} color={c.primary}/>
                <div><span style={{fontWeight:700,color:c.text}}>{selected.employee_name}</span><span style={{color:c.textMuted}}> · {selected.name}</span></div>
              </div>

              <div style={MD.field}>
                <label style={MD.label}>Initial Password *</label>
                <input style={MD.input} type="password" placeholder="Min 8 chars, 1 uppercase, 1 number"
                  value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} autoFocus/>
              </div>
              <div style={MD.field}>
                <label style={MD.label}>Confirm Password *</label>
                <input style={MD.input} type="password" placeholder="Repeat password"
                  value={form.confirm} onChange={e=>setForm(f=>({...f,confirm:e.target.value}))}/>
              </div>

              <div style={MD.field}>
                <label style={MD.label}>Permission Template <span style={{color:c.textMuted,fontWeight:400,textTransform:'none'}}>(optional)</span></label>
                <select style={MD.select} value={form.templateId} onChange={e=>setForm(f=>({...f,templateId:e.target.value}))}>
                  <option value="">No template — default permissions only</option>
                  {templates.map(t=>(
                    <option key={t.id} value={t.id}>{t.name} ({t.nodes?.length||0} permissions)</option>
                  ))}
                </select>
                <p style={{fontSize:11,color:c.textMuted,marginTop:5,display:'flex',alignItems:'center',gap:5}}>
                  <Icon name="alertCircle" size={11} color={c.textMuted}/>
                  Default gives: view own timesheets, add & edit own records.
                </p>
              </div>

              <div style={{background:c.orangeBg,border:`1px solid ${c.orangeBorder}`,borderRadius:8,padding:'10px 12px',fontSize:12,color:c.textSub,display:'flex',gap:8,alignItems:'flex-start'}}>
                <Icon name="alertCircle" size={13} color={c.orange} style={{flexShrink:0,marginTop:1}}/>
                The employee will be required to change this password on first login.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={MD.footer}>
          {step === 1 ? (
            <>
              <button style={MD.cancelBtn} onClick={onClose}>Cancel</button>
              <button style={{...MD.primaryBtn,opacity:selected?1:0.5}} disabled={!selected} onClick={()=>setStep(2)}>
                Next <Icon name="arrowRight" size={13} color="#fff"/>
              </button>
            </>
          ) : (
            <>
              <button style={MD.cancelBtn} onClick={()=>setStep(1)}>
                <Icon name="arrowLeft" size={13} color={c.textSub}/> Back
              </button>
              <button style={{...MD.primaryBtn,opacity:loading?0.7:1}} disabled={loading} onClick={handleCreate}>
                {loading ? t('creating') : t('create_account')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Users List (mobile) - desktop is pages/desktop/UsersPage.jsx ────────
function MobileUsersPage() {
  const { hasPermission } = useAuth()
  const { t } = useLang()
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const {data} = await usersAPI.list({search,page:1,page_length:50})
      setUsers(data.users); setTotal(data.total)
    } catch { toast.error('Failed to load users') }
    finally { setLoading(false) }
  }, [search])

  useEffect(() => { load() }, [load])

  if (detailId) return (
    <UserDetailPage
      userId={detailId}
      onBack={() => setDetailId(null)}
      onChanged={load}
    />
  )

  return (
    <div style={L.page}>
      <div style={L.pageHeader}>
        <div>
          <h1 style={L.title}>User Accounts</h1>
          <p style={L.sub}>{total} account{total!==1?'s':''}</p>
        </div>
        {hasPermission('users.create') && (
          <button style={L.primaryBtn} onClick={()=>setShowCreate(true)}>
            <Icon name="plus" size={14} color="#fff"/><span>New Account</span>
          </button>
        )}
      </div>

      <div style={L.toolbar}>
        <div style={{position:'relative',flex:1,maxWidth:320}}>
          <Icon name="search" size={14} color={c.textMuted} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/>
          <input style={L.searchInput} placeholder="Search accounts…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Desktop table */}
      <div style={L.tableCard}>
        {loading ? (
          <div style={L.loading}><div style={{width:24,height:24,border:`2px solid ${c.primaryBg}`,borderTopColor:c.primary,borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/></div>
        ) : users.length===0 ? (
          <div style={L.empty}><Icon name="users" size={36} color={c.borderStrong}/><div style={{marginTop:10,color:c.textMuted}}>No accounts found</div></div>
        ) : (
          <>
            {/* Desktop: table view */}
            <div style={{overflowX:'auto',display:'none'}} className="desktop-table">
              {/* hidden, use cards on all breakpoints for mobile compat */}
            </div>
            {/* Card list — works on all screen sizes */}
            <div style={L.userList}>
              {users.map(user => (
                <div key={user.id} style={L.userRow}>
                  <div style={L.userRowLeft}>
                    <div style={L.userAvatar}>{initials(user.display_name)}</div>
                    <div style={{minWidth:0}}>
                      <div style={L.userName}>{user.display_name}</div>
                      <div style={L.userMeta}>
                        <code style={L.code}>{user.username}</code>
                        {user.erp_employee_id && <span style={{color:c.textMuted}}>· {user.erp_employee_id}</span>}
                      </div>
                      <div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap'}}>
                        <Badge type={user.is_active?'active':'inactive'}>{user.is_active?'Active':'Inactive'}</Badge>
                        {user.is_sysadmin && <Badge type="admin">Admin</Badge>}
                        {user.erp_linked && <Badge type="linked">ERP Linked</Badge>}
                      </div>
                    </div>
                  </div>
                  <div style={L.userRowRight}>
                    <div style={{fontSize:11,color:c.textMuted,marginBottom:8,textAlign:'right'}}>
                      Last login: {fmtDate(user.last_login)}
                    </div>
                    <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                      <button style={L.viewBtn} onClick={()=>setDetailId(user.id)}>
                        <Icon name="eye" size={12} color={c.primary}/> View
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showCreate && <CreateModal onClose={()=>setShowCreate(false)} onCreated={()=>{setShowCreate(false);load()}}/>}
    </div>
  )
}

export default function UsersPage() {
  const isMobile = useIsMobile()
  return isMobile ? <MobileUsersPage /> : <DesktopUsersPage />
}

// ── Styles ────────────────────────────────────────────────────────────────────
const L = {
  page: {fontFamily:c.font},
  pageHeader: {display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:12},
  title: {margin:'0 0 4px',fontSize:22,fontWeight:800,color:c.text},
  sub: {margin:0,fontSize:13,color:c.textSub},
  primaryBtn: {display:'flex',alignItems:'center',gap:7,padding:'10px 18px',background:c.primary,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:c.font,boxShadow:`0 2px 6px ${c.primary}40`},
  toolbar: {marginBottom:16,display:'flex',gap:10,flexWrap:'wrap'},
  searchInput: {width:'100%',padding:'9px 14px 9px 36px',border:`1.5px solid ${c.border}`,borderRadius:8,fontSize:13,color:c.text,background:c.surface,fontFamily:c.font,boxSizing:'border-box'},
  tableCard: {background:c.surface,borderRadius:12,border:`1px solid ${c.border}`,overflow:'hidden',boxShadow:c.sm},
  loading: {display:'flex',alignItems:'center',justifyContent:'center',padding:48},
  empty: {display:'flex',flexDirection:'column',alignItems:'center',padding:48,color:c.textMuted},
  userList: {display:'flex',flexDirection:'column'},
  userRow: {display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'16px 18px',borderBottom:`1px solid ${c.bg}`,gap:12,flexWrap:'wrap'},
  userRowLeft: {display:'flex',alignItems:'flex-start',gap:12,flex:1,minWidth:200},
  userRowRight: {display:'flex',flexDirection:'column',alignItems:'flex-end',flexShrink:0},
  userAvatar: {width:38,height:38,borderRadius:'50%',background:c.primaryBg,color:c.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,flexShrink:0},
  userName: {fontSize:14,fontWeight:700,color:c.text},
  userMeta: {display:'flex',alignItems:'center',gap:6,marginTop:2,fontSize:11,color:c.textMuted},
  code: {fontFamily:c.mono,fontSize:11,background:c.bg,padding:'1px 6px',borderRadius:4,color:c.textSub},
  viewBtn: {display:'flex',alignItems:'center',gap:5,padding:'6px 12px',background:c.primaryBg,color:c.primary,border:`1px solid ${c.primaryBorder}`,borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:c.font},
}

const D = {
  page: {fontFamily:c.font,animation:'fadeIn 0.2s ease'},
  backBtn: {display:'flex',alignItems:'center',gap:6,background:'none',border:'none',color:c.textMuted,fontSize:13,cursor:'pointer',padding:'0 0 16px',fontFamily:c.font},
  header: {display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:16,marginBottom:24,background:c.surface,borderRadius:12,padding:20,border:`1px solid ${c.border}`,boxShadow:c.sm},
  headerLeft: {display:'flex',alignItems:'center',gap:16},
  bigAvatar: {width:56,height:56,borderRadius:'50%',background:c.primaryBg,color:c.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,flexShrink:0},
  name: {margin:0,fontSize:20,fontWeight:800,color:c.text},
  headerActions: {display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'},
  deactivateBtn: {display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:c.redBg,color:c.red,border:`1px solid ${c.redBorder}`,borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:c.font},
  activateBtn: {display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:c.greenBg,color:c.green,border:`1px solid ${c.greenBorder}`,borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:c.font},
  deleteBtn: {display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:c.redBg,color:c.red,border:`1px solid ${c.redBorder}`,borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',fontFamily:c.font},
  deleteConfirm: {display:'flex',alignItems:'center',gap:8,background:c.redBg,border:`1px solid ${c.redBorder}`,borderRadius:8,padding:'8px 12px',flexWrap:'wrap'},
  cancelBtn: {padding:'8px 14px',background:c.surface,color:c.textSub,border:`1.5px solid ${c.border}`,borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:c.font},
  primaryBtn: {padding:'9px 18px',background:c.primary,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:c.font},
  outBtn: {display:'flex',alignItems:'center',gap:6,padding:'8px 14px',background:c.surface,color:c.textSub,border:`1.5px solid ${c.border}`,borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:c.font},
  grid: {display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:14},
  card: {background:c.surface,borderRadius:12,border:`1px solid ${c.border}`,padding:20,boxShadow:c.sm},
  cardTitle: {display:'flex',alignItems:'center',gap:7,fontSize:13,fontWeight:700,color:c.text,marginBottom:14,paddingBottom:10,borderBottom:`1px solid ${c.bg}`},
  infoGrid: {display:'flex',flexDirection:'column',gap:0},
  infoRow: {display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'8px 0',borderBottom:`1px solid ${c.bg}`,gap:16},
  infoKey: {fontSize:12,color:c.textMuted,fontWeight:500,flexShrink:0},
  infoVal: {fontSize:13,color:c.text,fontWeight:500,textAlign:'right'},
  code: {fontFamily:c.mono,fontSize:11,background:c.bg,padding:'2px 7px',borderRadius:4,color:c.textSub},
  input: {width:'100%',padding:'10px 14px',border:`1.5px solid ${c.border}`,borderRadius:8,fontSize:13,color:c.text,background:c.surfaceRaised,fontFamily:c.font,boxSizing:'border-box'},
  select: {width:'100%',padding:'10px 14px',border:`1.5px solid ${c.border}`,borderRadius:8,fontSize:13,color:c.text,background:c.surfaceRaised,fontFamily:c.font,boxSizing:'border-box'},
  permGrid: {display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:6,marginTop:4},
  permRow: {display:'flex',alignItems:'flex-start',gap:8,padding:'8px 10px',borderRadius:7,border:`1px solid ${c.border}`,background:c.surfaceRaised},
  permRowOn: {background:c.greenBg,border:`1px solid ${c.greenBorder}`},
}

const MD = {
  overlay: {position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'16px',backdropFilter:'blur(4px)'},
  modal: {background:c.surface,borderRadius:14,width:'100%',maxWidth:580,boxShadow:c.xl,display:'flex',flexDirection:'column',maxHeight:'90dvh',border:`1px solid ${c.border}`},
  header: {padding:'20px 20px 0',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexShrink:0},
  title: {margin:'0 0 3px',fontSize:17,fontWeight:800,color:c.text},
  sub: {margin:0,fontSize:12,color:c.textMuted},
  closeBtn: {background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',padding:4,flexShrink:0},
  steps: {display:'flex',alignItems:'center',padding:'16px 20px',gap:0,position:'relative',flexShrink:0},
  step: {display:'flex',alignItems:'center',gap:7,flex:1},
  stepActive: {},
  stepNum: {width:22,height:22,borderRadius:'50%',background:c.bg,color:c.textMuted,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0,border:`1.5px solid ${c.border}`},
  stepNumActive: {background:c.primary,color:'#fff',border:`1.5px solid ${c.primary}`},
  stepLine: {position:'absolute',top:'50%',left:'calc(50% + 20px)',right:'calc(50% + 20px)',height:1,background:c.border,zIndex:0},
  body: {padding:'0 20px 12px',overflowY:'auto',flex:1},
  field: {marginBottom:14},
  label: {display:'block',fontSize:11,fontWeight:700,color:c.textSub,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:7},
  input: {width:'100%',padding:'10px 14px',border:`1.5px solid ${c.border}`,borderRadius:8,fontSize:14,color:c.text,background:c.surfaceRaised,fontFamily:c.font,boxSizing:'border-box'},
  select: {width:'100%',padding:'10px 14px',border:`1.5px solid ${c.border}`,borderRadius:8,fontSize:14,color:c.text,background:c.surfaceRaised,fontFamily:c.font,boxSizing:'border-box'},
  list: {border:`1px solid ${c.border}`,borderRadius:8,maxHeight:240,overflowY:'auto',marginBottom:12},
  listMsg: {display:'flex',alignItems:'center',gap:8,padding:'14px 16px',fontSize:13,color:c.textMuted},
  empRow: {display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer',borderBottom:`1px solid ${c.bg}`,transition:'background 0.1s'},
  empRowActive: {background:c.primaryBg},
  empAvatar: {width:30,height:30,borderRadius:'50%',background:c.primaryBg,color:c.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0},
  selectedBanner: {display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:c.primaryBg,border:`1px solid ${c.primaryBorder}`,borderRadius:8,fontSize:13,marginBottom:14},
  footer: {padding:'14px 20px',borderTop:`1px solid ${c.border}`,display:'flex',justifyContent:'flex-end',gap:10,flexShrink:0},
  cancelBtn: {padding:'10px 18px',background:c.surface,color:c.textSub,border:`1.5px solid ${c.border}`,borderRadius:8,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:c.font},
  primaryBtn: {display:'flex',alignItems:'center',gap:7,padding:'10px 20px',background:c.primary,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:c.font},
}
