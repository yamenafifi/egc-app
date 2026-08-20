import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { erpAPI } from '@/services/api'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import { PageWrap, PageHeader, Card, LoadingBlock } from '@/components/Shared'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'

const ERP_BASE = 'https://erp.egc-me.com'
function erpUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${ERP_BASE}${path}`
}

// ── IQAMA / ID Card ───────────────────────────────────────────────────────────
function IqamaCard({ imageUrl }) {
  const [imgErr, setImgErr] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const url = erpUrl(imageUrl)

  if (!url) return (
    <Card style={{padding:'28px 24px',textAlign:'center'}}>
      <Icon name="idCard" size={40} color={c.borderStrong}/>
      <div style={{fontSize:13,color:c.textMuted,marginTop:12,fontWeight:600}}>No IQAMA image uploaded</div>
      <div style={{fontSize:11,color:c.textMuted,marginTop:4}}>Upload via ERPNext → Employee → custom_iqamaid_image</div>
    </Card>
  )

  if (imgErr) return (
    <Card style={{padding:'20px 24px',display:'flex',gap:12,alignItems:'center'}}>
      <Icon name="alertCircle" size={18} color={c.orange}/>
      <div>
        <div style={{fontSize:13,fontWeight:600,color:c.text}}>Could not display image</div>
        <a href={url} target="_blank" rel="noreferrer" style={{fontSize:12,color:c.primary}}>Open in browser instead</a>
      </div>
    </Card>
  )

  return (
    <>
      <Card style={{overflow:'hidden'}}>
        {/* Image preview — click to zoom */}
        <div onClick={()=>setZoomed(true)} style={{
          cursor:'zoom-in', background:c.bg, display:'flex', justifyContent:'center',
          alignItems:'center', padding:20, minHeight:180, position:'relative',
        }}>
          <img
            src={url} alt="IQAMA / National ID"
            onError={()=>setImgErr(true)}
            style={{maxWidth:'100%',maxHeight:340,objectFit:'contain',borderRadius:8,boxShadow:c.md}}
          />
          <div style={{position:'absolute',bottom:16,right:20,background:'rgba(0,0,0,0.5)',borderRadius:6,padding:'4px 10px'}}>
            <span style={{fontSize:11,color:'#fff',fontWeight:600}}>Click to enlarge</span>
          </div>
        </div>
        <div style={{padding:'12px 18px',borderTop:`1px solid ${c.border}`,display:'flex',gap:10}}>
          <a href={url} download target="_blank" rel="noreferrer" style={{
            display:'flex',alignItems:'center',gap:6,padding:'8px 14px',
            background:c.primaryBg,color:c.primary,border:`1px solid ${c.primaryBorder}`,
            borderRadius:7,fontSize:12,fontWeight:700,textDecoration:'none',
          }}>
            <Icon name="download" size={13} color={c.primary}/> Download Image
          </a>
        </div>
      </Card>

      {/* Zoom modal */}
      {zoomed && (
        <div onClick={()=>setZoomed(false)} style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',
          display:'flex',alignItems:'center',justifyContent:'center',
          zIndex:1000,cursor:'zoom-out',padding:24,
        }}>
          <img src={url} alt="IQAMA" style={{maxWidth:'92vw',maxHeight:'92vh',objectFit:'contain',borderRadius:10}}/>
          <button onClick={()=>setZoomed(false)} style={{
            position:'absolute',top:20,right:24,background:'rgba(255,255,255,0.15)',
            border:'none',color:'#fff',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:13,
          }}>✕ Close</button>
        </div>
      )}
    </>
  )
}

// ── Passport ──────────────────────────────────────────────────────────────────
function PassportCard({ pdfPath, emp }) {
  const url = erpUrl(pdfPath)

  const fields = [
    ['Full Name',    emp?.employee_name],
    ['Nationality',  emp?.custom_nationality || emp?.custom_passport_nationality],
    ['Passport No.', emp?.custom_passport_number || emp?.passport_number],
    ['Date of Birth',emp?.date_of_birth],
    ['Issue Date',   emp?.custom_passport_issue_date],
    ['Expiry Date',  emp?.custom_passport_expiry_date || emp?.valid_upto],
  ].filter(([,v]) => v)

  return (
    <Card>
      {/* Passport details */}
      {fields.length > 0 ? (
        <div style={{padding:'18px 20px',borderBottom:url?`1px solid ${c.border}`:'none'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px 24px'}}>
            {fields.map(([label,value])=>(
              <div key={label}>
                <div style={{fontSize:10,fontWeight:700,color:c.textMuted,textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:3}}>{label}</div>
                <div style={{fontSize:13,fontWeight:600,color:c.text}}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{padding:'16px 20px',borderBottom:url?`1px solid ${c.border}`:'none'}}>
          <div style={{fontSize:13,color:c.textMuted}}>No passport details found in ERPNext. Add fields: custom_passport_number, custom_passport_expiry_date, etc.</div>
        </div>
      )}

      {/* PDF row */}
      {url ? (
        <div style={{padding:'14px 20px'}}>
          <div style={{display:'flex',alignItems:'center',gap:14,padding:'12px 14px',background:c.bg,borderRadius:9,border:`1px solid ${c.border}`}}>
            {/* PDF icon */}
            <div style={{width:38,height:46,background:'#e53e3e',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,boxShadow:'0 2px 6px rgba(229,62,62,0.3)'}}>
              <span style={{fontSize:9,fontWeight:800,color:'#fff',letterSpacing:0}}>PDF</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:c.text}}>Passport Scan</div>
              <div style={{fontSize:11,color:c.textMuted,marginTop:2}}>Front page — PDF document</div>
            </div>
            <div style={{display:'flex',gap:8,flexShrink:0}}>
              <a href={url} target="_blank" rel="noreferrer" style={{
                display:'flex',alignItems:'center',gap:5,padding:'7px 13px',
                background:c.surface,color:c.textSub,border:`1px solid ${c.border}`,
                borderRadius:7,fontSize:12,fontWeight:600,textDecoration:'none',
              }}>
                <Icon name="eye" size={12} color={c.textSub}/> View
              </a>
              <a href={url} download target="_blank" rel="noreferrer" style={{
                display:'flex',alignItems:'center',gap:5,padding:'7px 13px',
                background:c.primaryBg,color:c.primary,border:`1px solid ${c.primaryBorder}`,
                borderRadius:7,fontSize:12,fontWeight:700,textDecoration:'none',
              }}>
                <Icon name="download" size={12} color={c.primary}/> Download
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div style={{padding:'14px 20px',display:'flex',gap:10,alignItems:'center',color:c.textMuted}}>
          <Icon name="alertCircle" size={15} color={c.textMuted}/>
          <span style={{fontSize:13}}>No passport PDF uploaded. Upload via ERPNext → Employee → custom_passport_frontpage</span>
        </div>
      )}
    </Card>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function DocSection({ title, icon, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={16} color={c.textSub} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{title}</div>
      </div>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LegalDocumentsPage() {
  const { user } = useAuth()
  const [emp, setEmp] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.erp_employee_id) { setLoading(false); return }
    erpAPI.getEmployeeCard(user.erp_employee_id)
      .then(r => setEmp(r.data.employee))
      .catch(() => setError('Could not load documents from ERPNext.'))
      .finally(() => setLoading(false))
  }, [user])

  const isMobile = useIsMobile()

  const body = (
    <>
      {loading && <LoadingBlock text="Loading documents…" />}
      {error && (
        <div style={{ padding: '14px 16px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 13, color: '#DC2626', display: 'flex', gap: 8 }}>
          <Icon name="alertCircle" size={15} color="#DC2626" style={{ flexShrink: 0 }} /> {error}
        </div>
      )}
      {!loading && !error && !user?.erp_employee_id && (
        <div style={{ padding: '14px 16px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, fontSize: 13, color: c.textSub }}>
          Your account is not linked to an ERPNext employee record. Contact your administrator.
        </div>
      )}
      {emp && (
        <div style={{ maxWidth: 680 }}>
          <DocSection title="IQAMA / National ID" icon="idCard">
            <IqamaCard imageUrl={emp.custom_iqamaid_image} />
          </DocSection>
          <DocSection title="Passport" icon="passport">
            <PassportCard pdfPath={emp.custom_passport_frontpage} emp={emp} />
          </DocSection>
        </div>
      )}
    </>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Documents" />
        <div style={{ padding: '16px 16px 40px' }}>{body}</div>
      </div>
    )
  }

  // Desktop
  return (
    <PageWrap>
      <PageHeader title="Legal Documents" sub="Your IQAMA / National ID and passport documents from ERPNext" />
      {body}
    </PageWrap>
  )
}
