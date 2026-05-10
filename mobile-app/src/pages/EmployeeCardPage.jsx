import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { erpAPI } from '@/services/api'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import { PageWrap, PageHeader, Card, LoadingBlock } from '@/components/Shared'

const ERP_BASE = 'https://erp.egc-me.com'
function erpUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${ERP_BASE}${path}`
}

export default function EmployeeCardPage() {
  const { user } = useAuth()
  const [emp, setEmp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [photoErr, setPhotoErr] = useState(false)
  const cardRef = useRef(null)

  useEffect(() => {
    if (!user?.erp_employee_id) { setLoading(false); return }
    erpAPI.getEmployeeCard(user.erp_employee_id)
      .then(r => setEmp(r.data.employee))
      .catch(() => setError('Could not load employee data from ERPNext.'))
      .finally(() => setLoading(false))
  }, [user])

  const downloadCard = () => {
    if (!cardRef.current) return
    import('html2canvas').then(({ default: html2canvas }) => {
      html2canvas(cardRef.current, { scale: 2, backgroundColor: null, useCORS: true }).then(canvas => {
        const a = document.createElement('a')
        a.download = `employee-card-${user?.username || 'egc'}.png`
        a.href = canvas.toDataURL('image/png')
        a.click()
      })
    }).catch(() => window.print())
  }

  const ini = name => name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  // Photo: prefer ERP employee image field, then the portal erp_photo_url
  const photoSrc = erpUrl(emp?.image) || erpUrl(emp?.custom_iqamaid_image) || user?.erp_photo_url || null

  return (
    <PageWrap>
      <PageHeader
        title="Employee Card"
        sub="Your digital EGC employee identification card"
        action={emp && (
          <button onClick={downloadCard} style={{
            display:'flex', alignItems:'center', gap:7, padding:'10px 18px',
            background:c.primary, color:'#fff', border:'none', borderRadius:8,
            fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:c.font,
            boxShadow:`0 2px 6px ${c.primary}40`,
          }}>
            <Icon name="download" size={14} color="#fff"/> Download Card
          </button>
        )}
      />

      {loading && <LoadingBlock text="Loading employee data…"/>}

      {error && (
        <div style={{padding:'14px 16px',background:c.redBg,border:`1px solid ${c.redBorder}`,borderRadius:8,fontSize:13,color:c.red,display:'flex',gap:8}}>
          <Icon name="alertCircle" size={15} color={c.red} style={{flexShrink:0,marginTop:1}}/> {error}
        </div>
      )}

      {!loading && !error && !user?.erp_employee_id && (
        <div style={{padding:'14px 16px',background:c.orangeBg,border:`1px solid ${c.orangeBorder}`,borderRadius:8,fontSize:13,color:c.textSub}}>
          Your account is not linked to an ERPNext employee record. Contact your administrator.
        </div>
      )}

      {emp && (
        <>
          {/* The card itself */}
          <div style={{display:'flex',justifyContent:'center',padding:'8px 0 28px'}}>
            <div ref={cardRef} style={{
              width:390, background:`linear-gradient(145deg,${c.navy} 0%,#243044 100%)`,
              borderRadius:18, overflow:'hidden', boxShadow:c.xl, fontFamily:c.font,
            }}>
              {/* Header */}
              <div style={{background:c.primary,padding:'14px 22px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:800,color:'#fff',letterSpacing:'1.5px',textTransform:'uppercase'}}>EGC</div>
                  <div style={{fontSize:9,color:'rgba(255,255,255,0.7)',letterSpacing:'0.8px',textTransform:'uppercase'}}>Engineering Grouping Company</div>
                </div>
                <Icon name="briefcase" size={18} color="rgba(255,255,255,0.7)"/>
              </div>

              {/* Body */}
              <div style={{padding:'24px 22px',display:'flex',gap:18,alignItems:'flex-start'}}>
                {/* Photo */}
                <div style={{
                  width:82,height:98,borderRadius:10,overflow:'hidden',flexShrink:0,
                  background:c.primaryBg,border:'2px solid rgba(255,255,255,0.15)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                }}>
                  {photoSrc && !photoErr ? (
                    <img
                      src={photoSrc}
                      alt={emp.employee_name}
                      onError={() => setPhotoErr(true)}
                      style={{width:'100%',height:'100%',objectFit:'cover'}}
                    />
                  ) : (
                    <span style={{fontSize:28,fontWeight:800,color:c.primary}}>{ini(emp.employee_name)}</span>
                  )}
                </div>

                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:17,fontWeight:800,color:'#fff',marginBottom:3,lineHeight:1.2}}>{emp.employee_name}</div>
                  <div style={{fontSize:12,color:'rgba(255,255,255,0.55)',marginBottom:14,fontWeight:500}}>
                    {emp.designation || emp.department || 'Employee'}
                  </div>
                  {[
                    ['Employee ID', emp.name],
                    ['Department',  emp.department],
                    ['IQAMA No.',   emp.custom_iqama_number || user?.iqama_number],
                  ].filter(([,v])=>v).map(([label,value])=>(
                    <div key={label} style={{marginBottom:7}}>
                      <div style={{fontSize:8,fontWeight:700,color:'rgba(255,255,255,0.35)',textTransform:'uppercase',letterSpacing:'0.7px',marginBottom:1}}>{label}</div>
                      <div style={{fontSize:12,fontWeight:600,color:'#fff'}}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div style={{background:'rgba(0,0,0,0.2)',padding:'10px 22px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{display:'flex',alignItems:'center',gap:5}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:c.green}}/>
                  <span style={{fontSize:10,color:'rgba(255,255,255,0.5)',fontWeight:600}}>ACTIVE EMPLOYEE</span>
                </div>
                <span style={{fontSize:9,color:'rgba(255,255,255,0.3)'}}>{new Date().getFullYear()} · EGC</span>
              </div>
            </div>
          </div>

          {/* Details table below card */}
          <div style={{maxWidth:420,margin:'0 auto'}}>
            <Card style={{padding:'16px 20px'}}>
              <div style={{fontSize:11,fontWeight:700,color:c.textMuted,textTransform:'uppercase',letterSpacing:'0.7px',marginBottom:12}}>Employee Details</div>
              <div style={{display:'flex',flexDirection:'column',gap:0}}>
                {[
                  ['Full Name',       emp.employee_name],
                  ['Employee ID',     emp.name],
                  ['Department',      emp.department],
                  ['Designation',     emp.designation],
                  ['IQAMA No.',       emp.custom_iqama_number || user?.iqama_number],
                  ['Date of Joining', emp.date_of_joining],
                  ['Status',          emp.status],
                ].filter(([,v])=>v).map(([label,value])=>(
                  <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:`1px solid ${c.bg}`}}>
                    <span style={{fontSize:12,color:c.textMuted,fontWeight:600}}>{label}</span>
                    <span style={{fontSize:12,color:c.text,fontWeight:600}}>{value}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </PageWrap>
  )
}
