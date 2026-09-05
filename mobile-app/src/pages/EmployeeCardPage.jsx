import { useState, useEffect, useRef } from 'react'
import Barcode from 'react-barcode'
import { useAuth } from '@/context/AuthContext'
import { erpAPI } from '@/services/api'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import { PageWrap, PageHeader, Card, LoadingBlock } from '@/components/Shared'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { PrimaryButton } from '@/desktop/components/Page'


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
  // The backend already resolves these to full URLs (erp_service.py's
  // resolve_file_url, using the live-configured ERPNext base URL) -
  // never rebuild one here.
  const photoSrc = emp?.image || emp?.custom_iqamaid_image || user?.erp_photo_url || null

  const isMobile = useIsMobile()

  return (
    <div style={{ fontFamily: c.font, minHeight: '100%' }}>
      {/* Header — mobile uses back bar, desktop uses page header */}
      {isMobile ? (
        <PageTopBar
          title="Employee Card"
          action={emp && (
            <button onClick={downloadCard} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.primary, fontSize: 13, fontWeight: 600, fontFamily: c.font, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}>
              <Icon name="download" size={14} color={c.primary} /> Save
            </button>
          )}
        />
      ) : (
        <PageHeader
          title="Employee Card"
          sub="Your digital EGC employee identification card"
          action={emp && (
            <PrimaryButton onClick={downloadCard} icon={<Icon name="download" size={14} />}>Download Card</PrimaryButton>
          )}
        />
      )}

      <div style={{ maxWidth: 800, margin: isMobile ? '0' : '24px auto' }}>
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
            <div style={{
              display:'flex',justifyContent:'center',padding: isMobile ? '8px 0 28px' : '40px 0',
              background: isMobile ? 'transparent' : c.surface,
              borderRadius: isMobile ? 0 : 16,
              border: isMobile ? 'none' : `1px solid ${c.border}`,
              boxShadow: isMobile ? 'none' : c.sm,
              marginBottom: 24
            }}>
              <style>{`
                .egc-card-rotator { width:100%; display:flex; justify-content:center; padding: 16px; box-sizing: border-box; overflow: hidden; }
                @media (max-width: 767px) {
                  .egc-card-rotator {
                     padding: 0;
                     height: 540px;
                     display: flex; align-items: center; justify-content: center;
                  }
                  .egc-card-inner {
                     transform-origin: center center;
                     transform: rotate(90deg) scale(0.9) !important;
                  }
                }
              `}</style>
              <div className="egc-card-rotator">
                <div ref={cardRef} className="egc-card-inner" style={{
                  width:580, backgroundColor:'#fff', color:'#000',
                  fontFamily:'"Times New Roman", Times, serif',
                  padding:'14px 22px',
                  boxShadow:'0 4px 18px rgba(0,0,0,0.18)',
                  display:'flex', flexDirection:'column',
                  flexShrink:0,
                  border:'1.5px solid #c8c8c8',
                }}>

                  {/* ── Header ── */}
                  <div style={{display:'flex',alignItems:'center',marginBottom:10}}>
                    <div style={{width:64,flexShrink:0}}>
                      <img src="/card-logo.png" alt="EGC Logo" style={{width:'100%',height:'auto',objectFit:'contain'}}/>
                    </div>
                    <div style={{flex:1,textAlign:'center',lineHeight:1.15}}>
                      <div style={{fontSize:16,fontWeight:'bold',marginBottom:2}}>هوية الموظف</div>
                      <div style={{fontSize:14,fontWeight:'bold'}}>Employee Identity Card</div>
                    </div>
                    <div style={{width:64,flexShrink:0}}/>
                  </div>

                  {/* ── Body ── */}
                  <div style={{display:'flex',gap:70}}>

                    {/* Left: photo + barcode */}
                    <div style={{width:120,display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                      <div style={{width:'100%',height:158,backgroundColor:'#e4e4e4',overflow:'hidden'}}>
                        {photoSrc && !photoErr ? (
                          <img src={photoSrc} alt={emp.employee_name} onError={()=>setPhotoErr(true)}
                            style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                        ) : (
                          <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',
                            justifyContent:'center',fontSize:26,color:'#999',fontFamily:c.font}}>
                            {ini(emp.employee_name)}
                          </div>
                        )}
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginTop:2}}>
                        <Barcode
                          value={emp.name || user?.erp_employee_id || 'EGC'}
                          format="CODE128"
                          displayValue={true}
                          height={34}
                          width={1.3}
                          margin={0}
                          background="transparent"
                          fontSize={10}
                          fontOptions="bold"
                          font="monospace"
                        />
                      </div>
                    </div>

                    {/* Right: info */}
                    <div style={{flex:1,display:'flex',flexDirection:'column',gap:4,paddingLeft:6}}>

                      {/* Name block */}
                      <div style={{marginBottom:4}}>
                        <div style={{textAlign:'right',fontSize:17,fontWeight:'bold',lineHeight:1.15}}>
                          {emp.employee_name}
                        </div>
                        <div style={{textAlign:'left',fontSize:15,fontWeight:'bold',lineHeight:1.15}}>
                          {user?.en_display_name || emp.employee_name}
                        </div>
                      </div>

                      {/* Designation / Department */}
                      <div style={{marginBottom:4}}>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:'bold',lineHeight:1.25}}>
                          <span>{user?.designation_en || emp.designation || '—'}</span>
                          <span>{emp.designation || '—'}</span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,lineHeight:1.25,color:'#333'}}>
                          <span>{user?.department || emp.department || '—'}</span>
                          <span>{user?.department_ar || emp.department || '—'}</span>
                        </div>
                      </div>

                      {/* Fields */}
                      <div style={{display:'flex',flexDirection:'column',gap:3}}>

                        {/* IQAMA */}
                        <div>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontWeight:'bold'}}>
                            <span>IQAMA No.</span><span>رقم الإقامة</span>
                          </div>
                          <div style={{textAlign:'center',fontSize:12,letterSpacing:'0.5px'}}>
                            {emp.custom_iqama_number || user?.iqama_number || '—'}
                          </div>
                        </div>

                        {/* Phone – static placeholder */}
                        <div>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontWeight:'bold'}}>
                            <span>Phone Number</span><span>رقم الهاتف</span>
                          </div>
                          <div style={{textAlign:'center',fontSize:12}}>+966 56 020 9190</div>
                        </div>

                        {/* Email – static placeholder */}
                        <div>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:12,fontWeight:'bold'}}>
                            <span>Email Address</span><span>البريد الإلكتروني</span>
                          </div>
                          <div style={{textAlign:'center',fontSize:12}}>yamen@egc-me.com</div>
                        </div>

                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Details table below card */}
            <div style={{maxWidth:420,margin:'0 auto'}}>
              <Card style={{padding:'16px 20px'}}>
                <div style={{fontSize:11,fontWeight:700,color:c.textMuted,textTransform:'uppercase',letterSpacing:'0.7px',marginBottom:12}}>Employee Details</div>
                <div style={{display:'flex',flexDirection:'column',gap:0}}>
                  {[
                    ['Employee ID', emp.name],
                    ['IQAMA No.',   emp.custom_iqama_number || user?.iqama_number],
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
      </div>
    </div>
  )
}
