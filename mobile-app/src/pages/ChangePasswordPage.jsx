import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '@/services/api'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { c } from '@/theme'
import toast from 'react-hot-toast'
import { useLang } from '@/context/LangContext'

export default function ChangePasswordPage() {
  const { fetchMe } = useAuth()
  const { t } = useLang()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current:'', next:'', confirm:'' })
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState({ current:false, next:false, confirm:false })

  const checks = [
    { label:'At least 8 characters', ok: form.next.length >= 8 },
    { label:'One uppercase letter',  ok: /[A-Z]/.test(form.next) },
    { label:'One number',            ok: /\d/.test(form.next) },
    { label:'Passwords match',       ok: form.next === form.confirm && form.confirm.length > 0 },
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!checks.every(c => c.ok)) return toast.error('Please meet all password requirements')
    setLoading(true)
    try {
      await authAPI.changePassword(form.current, form.next)
      await fetchMe()
      toast.success(t('update_password'))
      navigate('/dashboard')
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to change password') }
    finally { setLoading(false) }
  }

  const fields = [
    { key:'current', label:t('current_password'), placeholder:'Enter current password' },
    { key:'next',    label:t('new_password'),     placeholder:'Min 8 chars, 1 uppercase, 1 number' },
    { key:'confirm', label:t('confirm_password'), placeholder:'Repeat new password' },
  ]

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.iconWrap}><Icon name="lock" size={24} color={c.primary} /></div>
        <h1 style={S.title}>Set New Password</h1>
        <p style={S.sub}>You must change your password before accessing the portal.</p>

        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {fields.map(({ key, label, placeholder }) => (
            <div key={key} style={S.field}>
              <label style={S.label}>{label}</label>
              <div style={S.inputWrap}>
                <input style={{ ...S.input, paddingRight:44 }}
                  type={showPw[key] ? 'text' : 'password'} placeholder={placeholder} required
                  value={form[key]} onChange={e => setForm(p=>({...p,[key]:e.target.value}))} />
                <button type="button" style={S.eyeBtn} onClick={() => setShowPw(p=>({...p,[key]:!p[key]}))}>
                  <Icon name={showPw[key] ? 'eyeOff' : 'eye'} size={14} color={c.textMuted} />
                </button>
              </div>
            </div>
          ))}

          {form.next.length > 0 && (
            <div style={S.checks}>
              {checks.map(ck => (
                <div key={ck.label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color: ck.ok ? c.green : c.textMuted }}>
                  <Icon name={ck.ok ? 'checkCircle' : 'alertCircle'} size={12} color={ck.ok ? c.green : c.textMuted} />
                  {ck.label}
                </div>
              ))}
            </div>
          )}

          <button style={{ ...S.btn, opacity:loading?0.75:1 }} disabled={loading}>
            {loading ? t('signing_in') : t('update_password')}
          </button>
        </form>
      </div>
    </div>
  )
}

const S = {
  page: { minHeight:'100dvh', background:c.sidebar, display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:c.font },
  card: { background:c.surface, borderRadius:14, padding:'36px 32px', width:'100%', maxWidth:420, boxShadow:c.xl, border:`1px solid ${c.border}` },
  iconWrap: { width:48, height:48, borderRadius:12, background:c.primaryBg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 },
  title: { fontSize:20, fontWeight:800, color:c.text, marginBottom:6 },
  sub: { fontSize:13, color:c.textSub, marginBottom:24, lineHeight:1.6 },
  field: { display:'flex', flexDirection:'column', gap:6 },
  label: { fontSize:11, fontWeight:700, color:c.textSub, textTransform:'uppercase', letterSpacing:'0.4px' },
  inputWrap: { position:'relative' },
  input: { width:'100%', padding:'11px 14px', border:`1.5px solid ${c.border}`, borderRadius:8, fontSize:14, color:c.text, background:c.surfaceRaised, fontFamily:c.font, boxSizing:'border-box' },
  eyeBtn: { position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', display:'flex', alignItems:'center' },
  checks: { display:'flex', flexDirection:'column', gap:5, padding:'4px 0' },
  btn: { padding:'13px', background:c.primary, color:'#fff', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:c.font, boxShadow:`0 2px 8px ${c.primary}40` },
}
