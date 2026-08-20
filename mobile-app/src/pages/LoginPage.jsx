import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import BottomSheet from '@/components/ui/BottomSheet'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showForgot, setShowForgot] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    try {
      const user = await login(form.username, form.password)
      navigate(user.must_change_password ? '/initial-password' : '/home')
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Invalid credentials')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#ffffff', fontFamily: c.font, padding: '24px 20px',
    }}>
      <div style={{
        width: '100%', maxWidth: 320,
      }}>
        {/* Logo + title */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
          <img
            src="/logo.png" alt="EGC"
            style={{ width: 44, height: 44, objectFit: 'contain', marginBottom: 16 }}
            onError={e => e.target.style.display = 'none'}
          />
          <div style={{ fontSize: 24, fontWeight: 700, color: c.text }}>Login to EGC App</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Username */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: c.textSub, marginBottom: 8 }}>
              ID / Iqama No.
            </label>
            <input
              style={{ width: '100%', padding: '12px 14px', border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 14, color: c.text, background: '#F9FAFB', fontFamily: c.font }}
              type="text" placeholder="10XXXXXXXX"
              value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              autoFocus required
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: c.textSub, marginBottom: 8 }}>
              Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                style={{ width: '100%', padding: '12px 40px 12px 14px', border: `1px solid ${c.border}`, borderRadius: 8, fontSize: 14, color: c.text, background: '#F9FAFB', fontFamily: c.font }}
                type={showPw ? 'text' : 'password'} placeholder="••••••"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
              <button type="button"
                style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}
                onClick={() => setShowPw(p => !p)}>
                <Icon name={showPw ? 'eyeOff' : 'eye'} size={15} color={c.textMuted} />
              </button>
            </div>
          </div>

          {errorMsg && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 8, fontSize: 13, color: '#B91C1C', marginTop: -4 }}>
              <Icon name="alertCircle" size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{errorMsg}</div>
            </div>
          )}

          {/* Submit */}
          <button
            style={{
              marginTop: 8, padding: '12px',
              background: '#111827', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: c.font,
              opacity: loading ? 0.75 : 1, transition: 'opacity 0.15s',
            }}
            type="submit" disabled={loading}>
            {loading
              ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  Signing in…
                </span>
              : 'Login'
            }
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button onClick={() => setShowForgot(true)} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: c.textMuted, textDecoration: 'underline', cursor: 'pointer', fontFamily: c.font }}>
            Forgot Password?
          </button>
        </div>
      </div>

      <BottomSheet open={showForgot} onClose={() => setShowForgot(false)} title="Forgot Password?">
        <div style={{ fontSize: 14, color: c.textSub, lineHeight: 1.6, paddingTop: 8 }}>
          <p style={{ margin: '0 0 12px 0' }}>Please contact the HR department or reach out to the IT department for password resets:</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${c.bg}` }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="user" size={16} color={c.textSub} />
            </div>
            <a href="tel:+966560209190" style={{ color: c.text, fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>+966 56 020 9190</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="fileText" size={16} color={c.textSub} />
            </div>
            <a href="mailto:yamen@egc-me.com" style={{ color: c.text, fontWeight: 600, textDecoration: 'none', fontSize: 14 }}>yamen@egc-me.com</a>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
