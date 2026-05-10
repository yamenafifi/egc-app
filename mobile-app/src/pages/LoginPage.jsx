import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { useLang } from '@/context/LangContext'
import { LANGUAGES, getLang, setLang } from '@/i18n'
import { c } from '@/theme'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const { t, lang, switchLang, languages, isRTL } = useLang()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await login(form.username, form.password)
      navigate(user.must_change_password ? '/change-password' : '/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid credentials')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100dvh', display:'flex', fontFamily:c.font, background:c.bg }}>

      {/* Left branding panel — hidden on mobile */}
      {!isMobile && (
        <div style={{
          flex:1, background:c.navy,
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:48,
        }}>
          <div style={{ maxWidth:380 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:40 }}>
              <img src="/logo.png" alt="EGC" style={{ width:40, height:40, borderRadius:10, objectFit:'contain' }} onError={e => e.target.style.display='none'} />
              <div style={{ fontSize:20, fontWeight:800, color:'#fff' }}>EGC Portal</div>
            </div>
            <h1 style={{ fontSize:30, fontWeight:800, color:'#fff', lineHeight:1.25, marginBottom:14 }}>
              Employee Management<br />& Time Tracking
            </h1>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.45)', lineHeight:1.7, marginBottom:32 }}>
              Integrated with ERPNext. QR-based attendance. Role-based access control.
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { icon:'qr',     text:'QR-based attendance tracking' },
                { icon:'link',   text:'Live sync with ERPNext' },
                { icon:'shield', text:'Granular permission system' },
              ].map(f => (
                <div key={f.text} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:28, height:28, borderRadius:7, background:c.primaryBg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Icon name={f.icon} size={14} color={c.primary} />
                  </div>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,0.55)' }}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Right form panel — full width on mobile */}
      <div style={{
        width: isMobile ? '100%' : 460,
        display:'flex', alignItems:'center', justifyContent:'center',
        padding: isMobile ? '32px 20px' : 24,
        background: isMobile ? c.navy : c.bg,
      }}>
        <div style={{
          background: c.surface,
          borderRadius: 14,
          padding: isMobile ? '36px 28px' : '40px 36px',
          width:'100%', maxWidth: isMobile ? 420 : 400,
          boxShadow: c.lg,
          border:`1px solid ${c.border}`,
        }}>
          {/* Logo shown on mobile (left panel hidden) */}
          {isMobile && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:28 }}>
              <img src="/logo.png" alt="EGC" style={{ width:36, height:36, borderRadius:8, objectFit:'contain' }} onError={e => e.target.style.display='none'} />
              <span style={{ fontSize:17, fontWeight:800, color:c.text }}>EGC Portal</span>
            </div>
          )}

          <h2 style={{ fontSize:20, fontWeight:800, color:c.text, marginBottom:6 }}>Sign in</h2>
          <p style={{ fontSize:13, color:c.textSub, marginBottom:24 }}>Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ fontSize:11, fontWeight:700, color:c.textSub, textTransform:'uppercase', letterSpacing:'0.4px' }}>
                Username / IQAMA No.
              </label>
              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                <Icon name="user" size={15} color={c.textMuted} style={{ position:'absolute', left:12, pointerEvents:'none' }} />
                <input
                  style={{ width:'100%', padding:'11px 14px 11px 38px', border:`1.5px solid ${c.border}`, borderRadius:8, fontSize:14, color:c.text, background:c.surfaceRaised, fontFamily:c.font, boxSizing:'border-box' }}
                  type="text" placeholder="Enter your username"
                  value={form.username} onChange={e => setForm(f=>({...f,username:e.target.value}))}
                  autoFocus required
                />
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ fontSize:11, fontWeight:700, color:c.textSub, textTransform:'uppercase', letterSpacing:'0.4px' }}>
                Password
              </label>
              <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                <Icon name="lock" size={15} color={c.textMuted} style={{ position:'absolute', left:12, pointerEvents:'none' }} />
                <input
                  style={{ width:'100%', padding:'11px 44px 11px 38px', border:`1.5px solid ${c.border}`, borderRadius:8, fontSize:14, color:c.text, background:c.surfaceRaised, fontFamily:c.font, boxSizing:'border-box' }}
                  type={showPw ? 'text' : 'password'} placeholder="Enter your password"
                  value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))}
                  required
                />
                <button type="button"
                  style={{ position:'absolute', right:12, background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center', padding:2 }}
                  onClick={() => setShowPw(p=>!p)}>
                  <Icon name={showPw ? 'eyeOff' : 'eye'} size={15} color={c.textMuted} />
                </button>
              </div>
            </div>

            <button
              style={{ marginTop:4, padding:'13px', background:c.primary, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:c.font, boxShadow:`0 2px 8px ${c.primary}40`, opacity:loading?0.75:1 }}
              type="submit" disabled={loading}>
              {loading
                ? <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                    <span style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block',animation:'spin 0.7s linear infinite'}}/>
                    Signing in…
                  </span>
                : <span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
                    Sign In <Icon name="arrowRight" size={16} color="#fff"/>
                  </span>}
            </button>
          </form>

          <p style={{ marginTop:20, textAlign:'center', fontSize:12, color:c.textMuted, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:c.font }}>
            <Icon name="alertCircle" size={12} color={c.textMuted} style={{marginRight:5}}/>
            Forgot password? Contact the office.
          </p>
        </div>
      </div>
    </div>
  )
}
