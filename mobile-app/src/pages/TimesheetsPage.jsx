import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLang } from '@/context/LangContext'
import { useLocation } from 'react-router-dom'
import { timesheetsAPI, usersAPI, settingsAPI } from '@/services/api'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import { PageWrap, PageHeader, Card, LoadingBlock, EmptyState, PrimaryBtn } from '@/components/Shared'
import toast from 'react-hot-toast'
import QRCode from 'qrcode'

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = iso => !iso ? '—' : new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})
const fmtTime = iso => !iso ? '—' : new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})
const fmtDT   = iso => !iso ? '—' : `${fmtDate(iso)}, ${fmtTime(iso)}`
const fmtHrs  = h  => { if(h==null) return '—'; const hrs=Math.floor(h); const m=Math.round((h-hrs)*60); return m>0?`${hrs}h ${m}m`:`${hrs}h` }

const STATUS_MAP = {
  open:    {bg:c.orangeBg, color:c.orange, border:c.orangeBorder, label:'Active'},
  closed:  {bg:c.greenBg,  color:c.green,  border:c.greenBorder,  label:'Closed'},
  bundled: {bg:c.blueBg,   color:c.blue,   border:c.blueBorder,   label:'Bundled'},
  pending: {bg:c.orangeBg, color:c.orange, border:c.orangeBorder, label:'Pending'},
  approved:{bg:c.greenBg,  color:c.green,  border:c.greenBorder,  label:'Approved'},
  rejected:{bg:c.redBg,    color:c.red,    border:c.redBorder,    label:'Rejected'},
  pushed:  {bg:c.purpleBg, color:c.purple, border:c.purpleBorder, label:'In ERP'},
}
function StatusBadge({status}) {
  const s = STATUS_MAP[status] || {bg:c.bg,color:c.textMuted,border:c.border,label:status}
  return <span style={{display:'inline-block',padding:'2px 9px',borderRadius:20,fontSize:11,fontWeight:700,background:s.bg,color:s.color,border:`1px solid ${s.border}`}}>{s.label}</span>
}

function TabBar({tabs,active,onChange}) {
  return (
    <div style={{display:'flex',borderBottom:`2px solid ${c.border}`,overflowX:'auto'}}>
      {tabs.map(tab=>(
        <button key={tab.id} onClick={()=>onChange(tab.id)} style={{
          display:'flex',alignItems:'center',gap:7,padding:'10px 16px',
          background:'none',border:'none',
          borderBottom:active===tab.id?`2px solid ${c.primary}`:'2px solid transparent',
          marginBottom:-2,cursor:'pointer',fontSize:13,fontWeight:600,whiteSpace:'nowrap',
          color:active===tab.id?c.text:c.textMuted,fontFamily:c.font,
        }}>
          <Icon name={tab.icon} size={14} color={active===tab.id?c.primary:c.textMuted}/>
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── My QR Code ─────────────────────────────────────────────────────────────────
function MyQRTab({user}) {
  const canvasRef = useRef(null)
  useEffect(()=>{
    if(!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current,
      JSON.stringify({user_id:user.id,display_name:user.display_name}),
      {width:240,margin:2,color:{dark:'#1A2332',light:'#ffffff'},errorCorrectionLevel:'H'}
    )
  },[user])
  const download = ()=>{
    const a=document.createElement('a'); a.download=`qr-${user.username}.png`
    a.href=canvasRef.current?.toDataURL(); a.click()
  }
  const ini = user.display_name?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'
  return (
    <div style={{display:'flex',justifyContent:'center',padding:'32px 24px'}}>
      <Card style={{padding:28,maxWidth:340,width:'100%'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
          <div style={{width:40,height:40,borderRadius:'50%',background:c.primaryBg,color:c.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700}}>{ini}</div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:c.text}}>{user.display_name}</div>
            <div style={{fontSize:12,color:c.textMuted,marginTop:2}}>Show this to your supervisor to clock in/out</div>
          </div>
        </div>
        <div style={{display:'flex',justifyContent:'center',marginBottom:20}}>
          <div style={{padding:10,background:'#fff',borderRadius:10,border:`1px solid ${c.border}`,boxShadow:c.sm}}>
            <canvas ref={canvasRef} style={{borderRadius:4,display:'block'}}/>
          </div>
        </div>
        <PrimaryBtn onClick={download} style={{width:'100%',justifyContent:'center'}}>
          <Icon name="download" size={14} color="#fff"/> Download QR
        </PrimaryBtn>
      </Card>
    </div>
  )
}

// ── QR Scanner ─────────────────────────────────────────────────────────────────
// Uses jsQR (loaded from CDN in index.html) — works in every browser
function QRScanner({onResult}) {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef  = useRef(null)
  const [on, setOn]       = useState(false)
  const [err, setErr]     = useState(null)
  const [status, setStatus] = useState('')

  const stop = useCallback(()=>{
    clearInterval(timerRef.current)
    timerRef.current = null
    if(streamRef.current){ streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null }
    if(videoRef.current){ videoRef.current.srcObject=null }
    setOn(false); setStatus('')
  },[])

  useEffect(()=>()=>stop(),[stop])

  const start = async()=>{
    setErr(null)
    if(!navigator.mediaDevices?.getUserMedia){
      setErr('Camera not available — ensure you are on HTTPS or localhost.'); return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:'environment'}}
      })
      streamRef.current = stream
      const v = videoRef.current
      v.srcObject = stream
      v.onloadedmetadata = ()=>{
        v.play().then(()=>{
          setOn(true)
          setStatus('Scanning…')
          timerRef.current = setInterval(()=>{
            if(!v.videoWidth) return
            const cvs = canvasRef.current
            cvs.width  = v.videoWidth
            cvs.height = v.videoHeight
            const ctx = cvs.getContext('2d',{willReadFrequently:true})
            ctx.drawImage(v,0,0)
            if(window.jsQR){
              const img = ctx.getImageData(0,0,cvs.width,cvs.height)
              const qr  = window.jsQR(img.data,img.width,img.height)
              if(qr?.data){ stop(); onResult(qr.data) }
            }
          },300)
        }).catch(()=>setErr('Could not play video stream.'))
      }
    } catch(e){
      setErr(e.name==='NotAllowedError'
        ?'Camera permission denied. Please allow access and try again.'
        :e.name==='NotFoundError'?'No camera found on this device.'
        :'Camera error: '+e.message)
    }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <canvas ref={canvasRef} style={{display:'none'}}/>
      <video  ref={videoRef}  style={{display:'none'}} playsInline muted/>

      {!on && (
        <button onClick={start} style={{
          display:'flex',alignItems:'center',justifyContent:'center',gap:10,
          padding:16,background:c.primaryBg,border:`2px dashed ${c.primaryBorder}`,
          borderRadius:10,cursor:'pointer',fontSize:14,fontWeight:700,color:c.primary,fontFamily:c.font,
        }}>
          <Icon name="scan" size={22} color={c.primary}/> Open Camera to Scan QR
        </button>
      )}

      {on && (
        <div style={{position:'relative',borderRadius:10,overflow:'hidden',background:'#000',lineHeight:0}}>
          {/* We render the video via ref — use an img-like element for preview */}
          <div ref={el=>{
            if(el && videoRef.current && !el.contains(videoRef.current)){
              videoRef.current.style.display='block'
              videoRef.current.style.width='100%'
              videoRef.current.style.maxHeight='280px'
              videoRef.current.style.objectFit='cover'
              el.appendChild(videoRef.current)
            }
          }} style={{minHeight:180,background:'#000'}}/>
          {/* viewfinder */}
          <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
            <div style={{width:160,height:160,border:`3px solid ${c.primary}`,borderRadius:12,boxShadow:'0 0 0 9999px rgba(0,0,0,0.45)'}}/>
          </div>
          <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'8px 14px',background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{display:'flex',alignItems:'center',gap:7}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:c.primary,animation:'pulse 1s infinite'}}/>
              <span style={{color:'#fff',fontSize:12,fontFamily:c.font}}>{status}</span>
            </div>
            <button onClick={stop} style={{padding:'3px 12px',background:'rgba(255,255,255,0.15)',color:'#fff',border:'1px solid rgba(255,255,255,0.25)',borderRadius:14,fontSize:11,cursor:'pointer',fontFamily:c.font}}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && (
        <div style={{padding:'10px 14px',background:c.redBg,border:`1px solid ${c.redBorder}`,borderRadius:8,fontSize:12,color:c.red,display:'flex',gap:8}}>
          <Icon name="alertCircle" size={13} color={c.red} style={{flexShrink:0,marginTop:1}}/>{err}
        </div>
      )}
    </div>
  )
}

// ── Scan Tab ───────────────────────────────────────────────────────────────────
function ScanTab() {
  const [step,setStep]           = useState('search') // search | action | done
  const [search,setSearch]       = useState('')
  const [showDrop,setShowDrop]   = useState(false)
  const [allUsers,setAllUsers]   = useState([])
  const [empId,setEmpId]         = useState('')
  const [empInfo,setEmpInfo]     = useState(null)
  const [clockSt,setClockSt]     = useState(null)
  const [projects,setProjects]   = useState([])
  const [projFilter,setProjFilter] = useState('')
  const [selProj,setSelProj]     = useState(null)
  const [note,setNote]           = useState('')
  const [loading,setLoading]     = useState(false)

  useEffect(()=>{ usersAPI.list({page_length:200}).then(r=>setAllUsers(r.data.users||[])).catch(()=>{}) },[])
  useEffect(()=>{
    const t=setTimeout(()=>timesheetsAPI.listProjects({search:projFilter||undefined}).then(r=>setProjects(r.data.projects||[])).catch(()=>{}) ,300)
    return()=>clearTimeout(t)
  },[projFilter])

  const ini = n=>n?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'
  const filtered = allUsers.filter(u=>u.display_name?.toLowerCase().includes(search.toLowerCase())||u.username?.includes(search))

  const loadEmp = async uid=>{
    setLoading(true)
    try {
      const [i,s]=await Promise.all([usersAPI.get(uid),timesheetsAPI.clockStatus(uid)])
      setEmpInfo(i.data.user); setClockSt(s.data); setStep('action')
    } catch(e){ toast.error(e.response?.data?.error||'Could not load employee') }
    finally{ setLoading(false) }
  }

  const handleQR = raw=>{
    try{
      const d=JSON.parse(raw)
      if(d.user_id){ setSearch(d.display_name||d.user_id); loadEmp(d.user_id) }
      else toast.error('Not a valid EGC employee QR code')
    } catch{ toast.error('Could not read QR code') }
  }

  const doAction = async()=>{
    setLoading(true)
    try{
      if(clockSt?.is_clocked_in){
        await timesheetsAPI.clockOut(empId,note)
        toast.success(`${empInfo.display_name} clocked out`)
      } else {
        if(!selProj){ toast.error('Select a project'); setLoading(false); return }
        await timesheetsAPI.clockIn(empId,selProj.name,note)
        toast.success(`${empInfo.display_name} clocked in — ${selProj.project_name}`)
      }
      setStep('done')
    } catch(e){ toast.error(e.response?.data?.error||'Failed') }
    finally{ setLoading(false) }
  }

  const reset=()=>{ setStep('search');setEmpId('');setEmpInfo(null);setClockSt(null);setSelProj(null);setNote('');setSearch('') }

  if(step==='done') return(
    <div style={{display:'flex',justifyContent:'center',padding:'40px 24px'}}>
      <Card style={{padding:'44px 32px',maxWidth:340,width:'100%',textAlign:'center'}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:c.greenBg,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
          <Icon name="checkCircle" size={28} color={c.green}/>
        </div>
        <div style={{fontSize:18,fontWeight:700,color:c.text,marginBottom:8}}>Recorded</div>
        <div style={{fontSize:13,color:c.textMuted,marginBottom:24}}>Attendance saved successfully.</div>
        <PrimaryBtn onClick={reset} style={{width:'100%',justifyContent:'center'}}>Scan Another Employee</PrimaryBtn>
      </Card>
    </div>
  )

  return(
    <div style={{display:'flex',justifyContent:'center',padding:'20px 20px 28px'}}>
      <Card style={{padding:22,maxWidth:560,width:'100%'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18,paddingBottom:14,borderBottom:`1px solid ${c.border}`}}>
          <div style={{width:38,height:38,borderRadius:9,background:c.blueBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon name="scan" size={17} color={c.blue}/>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:c.text}}>Clock In / Clock Out</div>
            <div style={{fontSize:12,color:c.textMuted}}>Scan QR code or search by name</div>
          </div>
        </div>

        <QRScanner onResult={handleQR}/>

        <div style={{marginTop:14}}>
          <label style={SL}>Or search by name</label>
          <div style={{position:'relative'}}>
            <Icon name="search" size={13} color={c.textMuted} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/>
            <input style={{...SI,paddingLeft:32}} placeholder="Search employees…"
              value={search} onChange={e=>{setSearch(e.target.value);setShowDrop(true)}} onFocus={()=>setShowDrop(true)}/>
            {showDrop&&search.length>0&&(
              <div style={{position:'absolute',top:'100%',left:0,right:0,background:c.surface,border:`1px solid ${c.border}`,borderRadius:8,boxShadow:c.lg,zIndex:100,maxHeight:200,overflowY:'auto',marginTop:4}}>
                {filtered.slice(0,8).map(u=>(
                  <div key={u.id} style={{display:'flex',alignItems:'center',gap:9,padding:'9px 12px',cursor:'pointer',borderBottom:`1px solid ${c.bg}`}}
                    onClick={()=>{setSearch(u.display_name);setShowDrop(false);loadEmp(u.id)}}>
                    <div style={{width:26,height:26,borderRadius:'50%',background:c.primaryBg,color:c.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,flexShrink:0}}>{ini(u.display_name)}</div>
                    <div><div style={{fontSize:13,fontWeight:600,color:c.text}}>{u.display_name}</div><div style={{fontSize:10,color:c.textMuted}}>{u.username}</div></div>
                  </div>
                ))}
                {filtered.length===0&&<div style={{padding:'10px 14px',fontSize:13,color:c.textMuted}}>No employees found</div>}
              </div>
            )}
          </div>
        </div>

        {loading&&<LoadingBlock text="Loading employee…"/>}

        {!loading&&empInfo&&clockSt&&(
          <>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',background:c.bg,borderRadius:8,marginTop:12,border:`1px solid ${c.border}`}}>
              <div style={{width:34,height:34,borderRadius:'50%',background:c.primaryBg,color:c.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>{ini(empInfo.display_name)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:c.text}}>{empInfo.display_name}</div>
                <div style={{fontSize:11,color:c.textMuted}}>{empInfo.erp_employee_id||empInfo.username}</div>
              </div>
              <StatusBadge status={clockSt.is_clocked_in?'open':'closed'}/>
            </div>

            {clockSt.is_clocked_in&&clockSt.open_record&&(
              <div style={{background:c.orangeBg,border:`1px solid ${c.orangeBorder}`,borderRadius:8,padding:'10px 13px',marginTop:10}}>
                <div style={{fontSize:10,fontWeight:700,color:c.orange,textTransform:'uppercase',marginBottom:3}}>Active Session</div>
                <div style={{fontSize:13,fontWeight:600,color:c.text}}>{clockSt.open_record.project_name}</div>
                <div style={{fontSize:11,color:c.textMuted,marginTop:2}}>Since {fmtTime(clockSt.open_record.clock_in)}, {fmtDate(clockSt.open_record.clock_in)}</div>
              </div>
            )}

            {!clockSt.is_clocked_in&&(
              <div style={{marginTop:12}}>
                <label style={SL}>Select Project *</label>
                <div style={{position:'relative',marginBottom:6}}>
                  <Icon name="search" size={13} color={c.textMuted} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/>
                  <input style={{...SI,paddingLeft:32}} placeholder="Filter projects…" value={projFilter} onChange={e=>setProjFilter(e.target.value)}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,maxHeight:200,overflowY:'auto'}}>
                  {projects.slice(0,12).map(p=>(
                    <div key={p.name} onClick={()=>setSelProj(p)} style={{display:'flex',alignItems:'flex-start',gap:7,padding:'9px 10px',border:`1.5px solid ${selProj?.name===p.name?c.primary:c.border}`,borderRadius:7,cursor:'pointer',background:selProj?.name===p.name?c.primaryBg:c.surface}}>
                      <Icon name="folder" size={12} color={selProj?.name===p.name?c.primary:c.textMuted} style={{marginTop:2,flexShrink:0}}/>
                      <div><div style={{fontSize:11,fontWeight:600,color:c.text}}>{p.project_name}</div><div style={{fontSize:9,color:c.textMuted}}>{p.name}</div></div>
                    </div>
                  ))}
                  {projects.length===0&&<div style={{fontSize:12,color:c.textMuted,gridColumn:'1/-1',padding:8}}>No projects found</div>}
                </div>
              </div>
            )}

            <div style={{marginTop:12}}>
              <label style={SL}>Note (optional)</label>
              <input style={SI} placeholder="Any notes…" value={note} onChange={e=>setNote(e.target.value)}/>
            </div>

            <button onClick={doAction} disabled={loading||(!clockSt.is_clocked_in&&!selProj)}
              style={{marginTop:14,width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:12,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:700,fontFamily:c.font,cursor:loading||(!clockSt.is_clocked_in&&!selProj)?'not-allowed':'pointer',background:clockSt.is_clocked_in?c.red:c.primary,opacity:loading||(!clockSt.is_clocked_in&&!selProj)?0.6:1}}>
              <Icon name={clockSt.is_clocked_in?'stopCircle':'playCircle'} size={16} color="#fff"/>
              {loading?'Processing…':clockSt.is_clocked_in?'Clock Out':'Clock In'}
            </button>
          </>
        )}
      </Card>
    </div>
  )
}

// ── Supervisor Manual Entry ────────────────────────────────────────────────────
function ManualEntryTab() {
  const [projects,setProjects] = useState([])
  const [allUsers,setAllUsers] = useState([])
  const [search,setSearch]     = useState('')
  const [showDrop,setShowDrop] = useState(false)
  const [selUser,setSelUser]   = useState(null)
  const [form,setForm]         = useState({project_id:'',date:new Date().toISOString().split('T')[0],clock_in:'09:00',clock_out:'17:00',note:''})
  const [saving,setSaving]     = useState(false)
  const [loadingProj,setLoadingProj] = useState(true)

  useEffect(()=>{
    timesheetsAPI.listProjects().then(r=>setProjects(r.data.projects||[])).finally(()=>setLoadingProj(false))
    usersAPI.list({page_length:200}).then(r=>setAllUsers(r.data.users||[])).catch(()=>{})
  },[])

  const ini = n=>n?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?'
  const filtered = allUsers.filter(u=>u.display_name?.toLowerCase().includes(search.toLowerCase())||u.username?.includes(search))

  const submit = async e=>{
    e.preventDefault()
    if(!selUser) return toast.error('Select an employee first')
    if(!form.project_id) return toast.error('Select a project')
    if(form.clock_out<=form.clock_in) return toast.error('Clock-out must be after clock-in')
    setSaving(true)
    try{
      await timesheetsAPI.manualEntry({
        employee_id:selUser.id,project_id:form.project_id,
        clock_in:new Date(`${form.date}T${form.clock_in}`).toISOString(),
        clock_out:new Date(`${form.date}T${form.clock_out}`).toISOString(),
        note:form.note,
      })
      toast.success(`Entry recorded for ${selUser.display_name}`)
      setSelUser(null); setSearch(''); setForm(f=>({...f,note:''}))
    } catch(e){ toast.error(e.response?.data?.error||'Failed') }
    finally{ setSaving(false) }
  }

  return(
    <div style={{display:'flex',justifyContent:'center',padding:20}}>
      <Card style={{padding:24,maxWidth:560,width:'100%'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,paddingBottom:14,borderBottom:`1px solid ${c.border}`}}>
          <div style={{width:38,height:38,borderRadius:9,background:c.primaryBg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon name="edit" size={17} color={c.primary}/>
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:c.text}}>Supervisor Manual Entry</div>
            <div style={{fontSize:12,color:c.textMuted}}>Record attendance on behalf of an employee</div>
          </div>
        </div>
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label style={SL}>Employee *</label>
            <div style={{position:'relative'}}>
              <Icon name="search" size={13} color={c.textMuted} style={{position:'absolute',left:11,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/>
              <input style={{...SI,paddingLeft:32}} placeholder="Search employee…"
                value={search} onChange={e=>{setSearch(e.target.value);setShowDrop(true);setSelUser(null)}} onFocus={()=>setShowDrop(true)}/>
              {showDrop&&search.length>0&&!selUser&&(
                <div style={{position:'absolute',top:'100%',left:0,right:0,background:c.surface,border:`1px solid ${c.border}`,borderRadius:8,boxShadow:c.lg,zIndex:100,maxHeight:200,overflowY:'auto',marginTop:4}}>
                  {filtered.slice(0,8).map(u=>(
                    <div key={u.id} style={{display:'flex',alignItems:'center',gap:9,padding:'9px 12px',cursor:'pointer',borderBottom:`1px solid ${c.bg}`}}
                      onClick={()=>{setSelUser(u);setSearch(u.display_name);setShowDrop(false)}}>
                      <div style={{width:26,height:26,borderRadius:'50%',background:c.primaryBg,color:c.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,flexShrink:0}}>{ini(u.display_name)}</div>
                      <div><div style={{fontSize:13,fontWeight:600,color:c.text}}>{u.display_name}</div><div style={{fontSize:10,color:c.textMuted}}>{u.username}</div></div>
                    </div>
                  ))}
                  {filtered.length===0&&<div style={{padding:'10px 14px',fontSize:13,color:c.textMuted}}>No employees found</div>}
                </div>
              )}
            </div>
            {selUser&&(
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6,padding:'8px 12px',background:c.primaryBg,border:`1px solid ${c.primaryBorder}`,borderRadius:7,fontSize:12}}>
                <Icon name="user" size={12} color={c.primary}/>
                <span style={{fontWeight:700,color:c.text}}>{selUser.display_name}</span>
                <span style={{color:c.textMuted}}>· {selUser.erp_employee_id||selUser.username}</span>
                <button type="button" onClick={()=>{setSelUser(null);setSearch('')}} style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:c.textMuted,fontSize:16,lineHeight:1}}>×</button>
              </div>
            )}
          </div>
          <div>
            <label style={SL}>Project *</label>
            {loadingProj?<div style={{fontSize:13,color:c.textMuted}}>Loading…</div>:(
              <select style={SI} value={form.project_id} onChange={e=>setForm(f=>({...f,project_id:e.target.value}))} required>
                <option value="">Select a project…</option>
                {projects.map(p=><option key={p.name} value={p.name}>{p.project_name} ({p.name})</option>)}
              </select>
            )}
          </div>
          <div>
            <label style={SL}>Date *</label>
            <input style={SI} type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} required max={new Date().toISOString().split('T')[0]}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={SL}>Clock In *</label><input style={SI} type="time" value={form.clock_in} onChange={e=>setForm(f=>({...f,clock_in:e.target.value}))} required/></div>
            <div><label style={SL}>Clock Out *</label><input style={SI} type="time" value={form.clock_out} onChange={e=>setForm(f=>({...f,clock_out:e.target.value}))} required/></div>
          </div>
          <div>
            <label style={SL}>Note (optional)</label>
            <input style={SI} placeholder="Site notes, reason…" value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
          </div>
          <button type="submit" disabled={saving||!selUser}
            style={{padding:12,background:c.primary,color:'#fff',border:'none',borderRadius:8,fontSize:14,fontWeight:700,cursor:saving||!selUser?'not-allowed':'pointer',fontFamily:c.font,opacity:saving||!selUser?0.6:1,boxShadow:`0 2px 8px ${c.primary}40`}}>
            {saving?'Saving…':'Save Entry'}
          </button>
        </form>
      </Card>
    </div>
  )
}

const SL = {display:'block',fontSize:11,fontWeight:700,color:c.textSub,textTransform:'uppercase',letterSpacing:'0.4px',marginBottom:6}
const SI = {width:'100%',padding:'10px 13px',border:`1.5px solid ${c.border}`,borderRadius:8,fontSize:13,color:c.text,background:c.surfaceRaised,fontFamily:c.font,boxSizing:'border-box'}

// ── My Entries ─────────────────────────────────────────────────────────────────
function EntriesTab({qrMode}) {
  const [entries,setEntries] = useState([])
  const [total,setTotal]     = useState(0)
  const [loading,setLoading] = useState(true)
  const [selected,setSelected] = useState(new Set())
  const [submitting,setSubmitting] = useState(false)
  const [statusFilter,setStatusFilter] = useState('')
  const [page,setPage]       = useState(1)
  const PAGE = 20

  const load = useCallback(async()=>{
    setLoading(true)
    try{
      const r=await timesheetsAPI.listEntries({page,page_length:PAGE,status:statusFilter||undefined})
      setEntries(r.data.entries||[]); setTotal(r.data.total||0)
    } catch{ toast.error('Could not load entries') }
    finally{ setLoading(false) }
  },[page,statusFilter])

  useEffect(()=>{ load() },[load])

  const toggle=(id,status)=>{
    if(status!=='closed') return
    setSelected(p=>{ const s=new Set(p); s.has(id)?s.delete(id):s.add(id); return s })
  }
  const closedCount = entries.filter(e=>e.status==='closed').length

  const handleSubmit = async()=>{
    if(!selected.size) return
    setSubmitting(true)
    try{
      await timesheetsAPI.createSubmission([...selected])
      toast.success(`${selected.size} record(s) submitted for approval`)
      setSelected(new Set()); load()
    } catch(e){ toast.error(e.response?.data?.error||'Submission failed') }
    finally{ setSubmitting(false) }
  }

  const handleDelete = async id=>{
    if(!confirm('Delete this entry?')) return
    try{ await timesheetsAPI.deleteEntry(id); toast.success('Entry deleted'); load() }
    catch(e){ toast.error(e.response?.data?.error||'Delete failed') }
  }

  return(
    <div style={{padding:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <select style={{padding:'7px 10px',border:`1.5px solid ${c.border}`,borderRadius:7,fontSize:12,color:c.text,background:c.surface,fontFamily:c.font}} value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}>
            <option value="">All</option>
            <option value="open">Active</option>
            <option value="closed">Closed</option>
            <option value="bundled">Bundled</option>
          </select>
          {closedCount>0&&<button style={{padding:'7px 12px',background:c.surface,color:c.textSub,border:`1.5px solid ${c.border}`,borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:c.font}} onClick={()=>setSelected(new Set(entries.filter(e=>e.status==='closed').map(e=>e.id)))}>Select All ({closedCount})</button>}
        </div>
        {selected.size>0&&(
          <PrimaryBtn onClick={handleSubmit} disabled={submitting}>
            <Icon name="upload" size={13} color="#fff"/>
            {submitting?'Submitting…':`Bundle & Submit (${selected.size})`}
          </PrimaryBtn>
        )}
      </div>
      {loading?<LoadingBlock/>:entries.length===0?(
        <EmptyState icon="clock" title="No records yet" sub={qrMode?'Ask your supervisor to scan your QR code.':'Your supervisor will record your attendance.'}/>
      ):(
        <>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{background:'#F8FAFC'}}>
                {['','Date','Project','Clock In','Clock Out','Hours','Status','Scanned By',''].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:c.textMuted,textTransform:'uppercase',letterSpacing:'0.6px',borderBottom:`1px solid ${c.border}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{entries.map(e=>(
                <tr key={e.id} style={{borderBottom:`1px solid ${c.bg}`,background:selected.has(e.id)?c.primaryBg:'white'}}>
                  <td style={{padding:'9px 10px'}}>{e.status==='closed'&&<input type="checkbox" checked={selected.has(e.id)} onChange={()=>toggle(e.id,e.status)} style={{cursor:'pointer'}}/>}</td>
                  <td style={{padding:'9px 10px'}}>{fmtDate(e.clock_in)}</td>
                  <td style={{padding:'9px 10px',fontWeight:600}}>{e.project_name}</td>
                  <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}>{fmtDate(e.clock_in)} {fmtTime(e.clock_in)}</td>
                  <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}>{e.clock_out?`${fmtDate(e.clock_out)} ${fmtTime(e.clock_out)}`:<span style={{color:c.orange,fontWeight:700,fontSize:10}}>LIVE</span>}</td>
                  <td style={{padding:'9px 10px',fontWeight:700}}>{fmtHrs(e.hours)}</td>
                  <td style={{padding:'9px 10px'}}><StatusBadge status={e.status}/></td>
                  <td style={{padding:'9px 10px',color:c.textMuted,fontSize:11}}>{e.scanned_by_name||'—'}</td>
                  <td style={{padding:'9px 10px'}}>{e.status==='closed'&&<button style={{padding:'4px 7px',background:c.redBg,border:`1px solid ${c.redBorder}`,borderRadius:5,cursor:'pointer'}} onClick={()=>handleDelete(e.id)}><Icon name="trash" size={11} color={c.red}/></button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10,borderTop:`1px solid ${c.border}`,marginTop:6}}>
            <span style={{fontSize:12,color:c.textMuted}}>{total} total</span>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',background:c.surface,border:`1px solid ${c.border}`,borderRadius:6,cursor:page===1?'default':'pointer',opacity:page===1?0.4:1}} disabled={page===1} onClick={()=>setPage(p=>p-1)}><Icon name="chevronLeft" size={13}/></button>
              <span style={{fontSize:12,color:c.textMuted}}>{page}</span>
              <button style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',background:c.surface,border:`1px solid ${c.border}`,borderRadius:6,cursor:page*PAGE>=total?'default':'pointer',opacity:page*PAGE>=total?0.4:1}} disabled={page*PAGE>=total} onClick={()=>setPage(p=>p+1)}><Icon name="chevronRight" size={13}/></button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Submissions ────────────────────────────────────────────────────────────────
function SubmissionsTab({user,hasPermission}) {
  const [subs,setSubs]           = useState([])
  const [total,setTotal]         = useState(0)
  const [loading,setLoading]     = useState(true)
  const [statusFilter,setStatusFilter] = useState('')
  const [page,setPage]           = useState(1)
  const [view,setView]           = useState('list') // 'list' | 'detail' | 'confirm'
  const [detail,setDetail]       = useState(null)
  const [confirm,setConfirm]     = useState(null) // {type,label,fn}
  const [rejectNote,setRejectNote] = useState('')
  const [actionLoading,setActionLoading] = useState(false)
  const PAGE = 20

  const canApprove = hasPermission('timesheet.approve')
  const canViewAll = hasPermission('timesheet.view_all')||user.is_sysadmin
  const canPush    = hasPermission('timesheet.submit_to_erp')||user.is_sysadmin
  const canDelete  = canApprove||user.is_sysadmin

  const load = useCallback(async()=>{
    setLoading(true)
    try{
      const r=await timesheetsAPI.listSubmissions({page,page_length:PAGE,status:statusFilter||undefined})
      setSubs(r.data.submissions||[]); setTotal(r.data.total||0)
    } catch{ toast.error('Could not load') }
    finally{ setLoading(false) }
  },[page,statusFilter])

  useEffect(()=>{ load() },[load])

  const openDetail = async sub=>{
    try{
      const r=await timesheetsAPI.getSubmission(sub.id)
      setDetail(r.data.submission); setView('detail'); setRejectNote('')
    } catch{ toast.error('Could not load details') }
  }

  const runAction = async(fn,msg)=>{
    setActionLoading(true)
    try{ await fn(); if(msg) toast.success(msg); setView('list'); setDetail(null); setConfirm(null); load() }
    catch(e){ toast.error(e.response?.data?.error||'Failed') }
    finally{ setActionLoading(false) }
  }

  const askConfirm = (type,label,fn)=>{ setConfirm({type,label,fn}); setView('confirm') }

  // ── Confirm view ─────────────────────────────────────────────────────────
  if(view==='confirm'&&confirm) return(
    <div style={{padding:24}}>
      <button style={BK} onClick={()=>setView('detail')}><Icon name="chevronLeft" size={13} color={c.textMuted}/> Back</button>
      <Card style={{padding:28,maxWidth:460}}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:20}}>
          <div style={{width:44,height:44,borderRadius:'50%',
            background:confirm.type==='approve'?c.greenBg:c.redBg,
            display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <Icon name={confirm.type==='approve'?'checkCircle':'trash'} size={22} color={confirm.type==='approve'?c.green:c.red}/>
          </div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:c.text}}>{confirm.label}</div>
            <div style={{fontSize:13,color:c.textMuted,marginTop:3}}>This action cannot be undone.</div>
          </div>
        </div>
        {confirm.type==='reject'&&(
          <div style={{marginBottom:16}}>
            <label style={SL}>Rejection Reason *</label>
            <input style={{...SI,marginTop:6}} placeholder="Enter reason for rejection…" value={rejectNote} onChange={e=>setRejectNote(e.target.value)} autoFocus/>
          </div>
        )}
        <div style={{display:'flex',gap:10}}>
          <button disabled={actionLoading}
            style={{padding:'10px 20px',background:confirm.type==='approve'?c.green:c.red,color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:actionLoading?'not-allowed':'pointer',fontFamily:c.font,opacity:actionLoading?0.7:1}}
            onClick={()=>{
              if(confirm.type==='reject'&&!rejectNote.trim()){toast.error('Rejection reason required');return}
              runAction(confirm.fn, confirm.type==='approve'?'Submission approved':confirm.type==='reject'?'Submission rejected':'Bundle deleted')
            }}>
            {actionLoading?'Processing…':'Confirm'}
          </button>
          <button style={{padding:'10px 18px',background:c.surface,color:c.textSub,border:`1.5px solid ${c.border}`,borderRadius:8,fontSize:13,cursor:'pointer',fontFamily:c.font}}
            onClick={()=>setView('detail')}>Cancel</button>
        </div>
      </Card>
    </div>
  )

  // ── Detail view ───────────────────────────────────────────────────────────
  if(view==='detail'&&detail){
    // Group records by employee
    const byEmp = {}
    ;(detail.records||[]).forEach(r=>{
      if(!byEmp[r.user_id]) byEmp[r.user_id]={name:r.display_name,records:[]}
      byEmp[r.user_id].records.push(r)
    })
    const empGroups = Object.values(byEmp)

    return(
      <div style={{padding:20}}>
        <button style={BK} onClick={()=>setView('list')}><Icon name="chevronLeft" size={13} color={c.textMuted}/> Back to submissions</button>
        <Card>
          {/* Header */}
          <div style={{padding:'16px 20px',borderBottom:`1px solid ${c.border}`,display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
            <div>
              <h2 style={{margin:'0 0 3px',fontSize:16,fontWeight:700,color:c.text}}>
                Timesheet Bundle
                <span style={{fontSize:12,fontWeight:500,color:c.textMuted,marginLeft:8}}>submitted by {detail.display_name}</span>
              </h2>
              <div style={{fontSize:11,color:c.textMuted}}>
                {fmtDT(detail.submitted_at)}
                {detail.reviewed_by_name&&` · Reviewed by ${detail.reviewed_by_name}`}
              </div>
            </div>
            <StatusBadge status={detail.status}/>
          </div>

          {/* Stats */}
          <div style={{display:'flex',background:'#F8FAFC',borderBottom:`1px solid ${c.border}`,flexWrap:'wrap'}}>
            {[
              [fmtHrs(detail.total_hours),'Total Hours','clock',c.navy],
              [empGroups.length,'Employees','users',c.blue],
              [(detail.records||[]).length,'Sessions','list',c.primary],
              [detail.erp_timesheet_id||'—','ERP ID','link',c.purple],
            ].map(([v,l,ico,col])=>(
              <div key={l} style={{flex:1,minWidth:100,padding:'14px 18px',borderRight:`1px solid ${c.border}`}}>
                <div style={{width:26,height:26,borderRadius:7,background:col+'18',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:5}}><Icon name={ico} size={12} color={col}/></div>
                <div style={{fontSize:17,fontWeight:700,color:c.text}}>{v}</div>
                <div style={{fontSize:10,color:c.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',marginTop:1}}>{l}</div>
              </div>
            ))}
          </div>

          {detail.review_note&&(
            <div style={{display:'flex',gap:8,margin:'12px 20px 0',padding:'9px 13px',background:c.orangeBg,border:`1px solid ${c.orangeBorder}`,borderRadius:7,fontSize:12}}>
              <Icon name="alertCircle" size={12} color={c.orange}/>
              <span><strong>Review note:</strong> {detail.review_note}</span>
            </div>
          )}

          {/* Records grouped by employee */}
          <div style={{padding:'16px 20px'}}>
            {empGroups.map(emp=>(
              <div key={emp.name} style={{marginBottom:22}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <div style={{width:28,height:28,borderRadius:'50%',background:c.primaryBg,color:c.primary,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0}}>
                    {emp.name?.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()}
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:c.text}}>{emp.name}</div>
                  <div style={{fontSize:11,color:c.textMuted}}>
                    {fmtHrs(emp.records.reduce((s,r)=>s+(r.hours||0),0))} · {emp.records.length} session{emp.records.length!==1?'s':''}
                  </div>
                </div>
                <div style={{overflowX:'auto',borderRadius:8,border:`1px solid ${c.border}`}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead><tr style={{background:'#F8FAFC'}}>
                      {['Project','Clock In','Clock Out','Hours','Scanned By','Note'].map(h=>(
                        <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:700,color:c.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',borderBottom:`1px solid ${c.border}`,whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{emp.records.map(r=>(
                      <tr key={r.id} style={{borderBottom:`1px solid ${c.bg}`}}>
                        <td style={{padding:'9px 12px',fontWeight:600}}>{r.project_name}</td>
                        <td style={{padding:'9px 12px',whiteSpace:'nowrap'}}>{fmtDate(r.clock_in)}, {fmtTime(r.clock_in)}</td>
                        <td style={{padding:'9px 12px',whiteSpace:'nowrap'}}>{fmtDate(r.clock_out)}, {fmtTime(r.clock_out)}</td>
                        <td style={{padding:'9px 12px',fontWeight:700}}>{fmtHrs(r.hours)}</td>
                        <td style={{padding:'9px 12px',color:c.textMuted,fontSize:11}}>{r.scanned_by_name||'—'}</td>
                        <td style={{padding:'9px 12px',color:c.textMuted,fontSize:11}}>{r.note||'—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{padding:'14px 20px',borderTop:`1px solid ${c.border}`,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            {detail.status==='pending'&&canApprove&&(<>
              <button style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',background:c.green,color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:c.font}}
                onClick={()=>askConfirm('approve','Approve this submission?',()=>timesheetsAPI.approve(detail.id))}>
                <Icon name="check" size={13} color="#fff"/> Approve
              </button>
              <button style={{display:'flex',alignItems:'center',gap:6,padding:'9px 14px',background:c.redBg,color:c.red,border:`1px solid ${c.redBorder}`,borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:c.font}}
                onClick={()=>askConfirm('reject','Reject this submission?',()=>timesheetsAPI.reject(detail.id,rejectNote))}>
                <Icon name="x" size={13} color={c.red}/> Reject
              </button>
            </>)}
            {detail.status==='approved'&&canPush&&(
              <button style={{display:'flex',alignItems:'center',gap:7,padding:'10px 18px',background:c.purple,color:'#fff',border:'none',borderRadius:7,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:c.font}}
                onClick={()=>runAction(async()=>{const r=await timesheetsAPI.pushToErp(detail.id);toast.success(r.data.message)},null)} disabled={actionLoading}>
                <Icon name="upload" size={14} color="#fff"/>{actionLoading?'Pushing…':'Push to ERPNext'}
              </button>
            )}
            {detail.status==='pushed'&&(
              <div style={{display:'flex',alignItems:'center',gap:6,color:c.purple,fontSize:13,fontWeight:600}}>
                <Icon name="checkCircle" size={14} color={c.purple}/> Pushed as {detail.erp_timesheet_id}
              </div>
            )}
            {canDelete&&['pending','approved','rejected'].includes(detail.status)&&(
              <button style={{display:'flex',alignItems:'center',gap:6,padding:'9px 14px',background:c.redBg,color:c.red,border:`1px solid ${c.redBorder}`,borderRadius:7,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:c.font,marginLeft:'auto'}}
                onClick={()=>askConfirm('delete','Delete this bundle?',()=>timesheetsAPI.deleteSubmission(detail.id))}>
                <Icon name="trash" size={13} color={c.red}/> Delete Bundle
              </button>
            )}
          </div>
        </Card>
      </div>
    )
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return(
    <div style={{padding:20}}>
      <div style={{marginBottom:14}}>
        <select style={{padding:'7px 10px',border:`1.5px solid ${c.border}`,borderRadius:7,fontSize:12,color:c.text,background:c.surface,fontFamily:c.font}} value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}>
          <option value="">All Statuses</option>
          <option value="pending">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="pushed">Pushed to ERP</option>
        </select>
      </div>
      {loading?<LoadingBlock/>:subs.length===0?(
        <EmptyState icon="list" title="No submissions" sub={canViewAll?'No submissions match the filter.':'Bundle entries from My Entries and submit for approval.'}/>
      ):(
        <>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead><tr style={{background:'#F8FAFC'}}>
                {['Submitted By','Date','Total Hours','Employees','Sessions','Status','Reviewed By','ERP ID',''].map(h=>(
                  <th key={h} style={{padding:'8px 10px',textAlign:'left',fontSize:10,fontWeight:700,color:c.textMuted,textTransform:'uppercase',letterSpacing:'0.6px',borderBottom:`1px solid ${c.border}`,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{subs.map(sub=>(
                <tr key={sub.id} style={{borderBottom:`1px solid ${c.bg}`}}>
                  <td style={{padding:'9px 10px',fontWeight:600}}>{sub.display_name}</td>
                  <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}>{fmtDate(sub.submitted_at)}</td>
                  <td style={{padding:'9px 10px',fontWeight:700}}>{fmtHrs(sub.total_hours)}</td>
                  <td style={{padding:'9px 10px'}}>{sub.employee_count||'—'}</td>
                  <td style={{padding:'9px 10px'}}>{sub.record_ids?.length||0}</td>
                  <td style={{padding:'9px 10px'}}><StatusBadge status={sub.status}/></td>
                  <td style={{padding:'9px 10px',color:c.textMuted,fontSize:11}}>{sub.reviewed_by_name||'—'}</td>
                  <td style={{padding:'9px 10px',fontSize:11,color:sub.erp_timesheet_id?c.purple:c.textMuted,fontWeight:sub.erp_timesheet_id?700:400}}>{sub.erp_timesheet_id||'—'}</td>
                  <td style={{padding:'9px 10px'}}>
                    <button style={{display:'flex',alignItems:'center',gap:4,padding:'4px 9px',background:c.blueBg,color:c.blue,border:`1px solid ${c.blueBorder}`,borderRadius:5,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:c.font}}
                      onClick={()=>openDetail(sub)}>
                      <Icon name="eye" size={11} color={c.blue}/> View
                    </button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10,borderTop:`1px solid ${c.border}`,marginTop:6}}>
            <span style={{fontSize:12,color:c.textMuted}}>{total} total</span>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',background:c.surface,border:`1px solid ${c.border}`,borderRadius:6,cursor:page===1?'default':'pointer',opacity:page===1?0.4:1}} disabled={page===1} onClick={()=>setPage(p=>p-1)}><Icon name="chevronLeft" size={13}/></button>
              <span style={{fontSize:12,color:c.textMuted}}>{page}</span>
              <button style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',background:c.surface,border:`1px solid ${c.border}`,borderRadius:6,cursor:page*PAGE>=total?'default':'pointer',opacity:page*PAGE>=total?0.4:1}} disabled={page*PAGE>=total} onClick={()=>setPage(p=>p+1)}><Icon name="chevronRight" size={13}/></button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const BK = {display:'flex',alignItems:'center',gap:5,background:'none',border:'none',color:c.textMuted,fontSize:13,cursor:'pointer',padding:'0 0 14px',fontFamily:c.font}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function TimesheetsPage() {
  const {user,hasPermission} = useAuth()
  const location = useLocation()
  const [qrEnabled,setQrEnabled]       = useState(true)
  const [loadingSettings,setLoadingSettings] = useState(true)

  useEffect(()=>{
    settingsAPI.get()
      .then(r=>setQrEnabled(r.data.settings?.qr_timesheet_enabled??true))
      .catch(()=>setQrEnabled(true))
      .finally(()=>setLoadingSettings(false))
  },[])

  const canScan    = hasPermission('timesheet.add_record')
  const canApprove = hasPermission('timesheet.approve')

  const tabs = [
    {id:'qr',    label:'My QR Code',    icon:'qr'},
    canScan&&(qrEnabled?{id:'scan',label:'Scan Employee',icon:'scan'}:{id:'manual',label:'Manual Entry',icon:'edit'}),
    {id:'entries',     label:'My Entries',    icon:'list'},
    {id:'submissions', label:canApprove?'Approvals':'Submissions', icon:'clock'},
  ].filter(Boolean)

  const [active,setActive] = useState(()=>{
    const st=location.state?.tab
    return st&&tabs.find(t=>t.id===st)?st:'qr'
  })

  if(loadingSettings) return <PageWrap><LoadingBlock/></PageWrap>

  return(
    <PageWrap>
      <PageHeader title="Timesheets" sub={qrEnabled?'QR-based attendance tracking':'Supervisor manual entry mode'}/>
      <Card>
        <div style={{padding:'0 20px'}}>
          <TabBar tabs={tabs} active={active} onChange={setActive}/>
        </div>
        <div style={{borderTop:`1px solid ${c.border}`}}>
          {active==='qr'          && <MyQRTab user={user}/>}
          {active==='scan'        && <ScanTab/>}
          {active==='manual'      && <ManualEntryTab/>}
          {active==='entries'     && <EntriesTab qrMode={qrEnabled}/>}
          {active==='submissions' && <SubmissionsTab user={user} hasPermission={hasPermission}/>}
        </div>
      </Card>
    </PageWrap>
  )
}
