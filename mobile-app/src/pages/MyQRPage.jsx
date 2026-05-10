import { useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'

// Inline QR code generator using a simple canvas-based approach
// We use the free qrcode.js CDN-free approach via dynamic import of qrcode lib
// Since we can't use npm for this artifact, we'll use a QR API service pattern
// that generates a URL-based QR, then display it as an image

export default function MyQRPage() {
  const { user } = useAuth()

  if (!user) return null

  const qrValue = user.id
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrValue)}&bgcolor=ffffff&color=0f2540&qzone=2`

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>My QR Code</h1>
        <p style={styles.sub}>Show this to your supervisor to clock in or out</p>
      </div>

      <div style={styles.card}>
        <div style={styles.employeeInfo}>
          <div style={styles.avatar}>
            {user.display_name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={styles.name}>{user.display_name}</div>
            <div style={styles.username}>{user.username}</div>
          </div>
        </div>

        <div style={styles.qrWrap}>
          <img
            src={qrUrl}
            alt="Personal QR Code"
            style={styles.qrImage}
            onError={(e) => { e.target.style.display = 'none' }}
          />
        </div>

        <div style={styles.qrNote}>
          <div style={styles.qrId}>{user.id}</div>
          <p style={styles.noteText}>
            This QR code is unique to you. Your supervisor scans it to record your attendance on a project.
          </p>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    padding: 32,
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    maxWidth: 520,
  },
  header: { marginBottom: 28 },
  title: { margin: 0, fontSize: 24, fontWeight: 700, color: '#0f2540' },
  sub: { margin: '4px 0 0', fontSize: 14, color: '#7a8fa6' },
  card: {
    background: '#fff', borderRadius: 20,
    padding: 36, border: '1px solid #e8edf2',
    boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28,
  },
  employeeInfo: {
    display: 'flex', alignItems: 'center', gap: 14,
    width: '100%', padding: '0 0 20px', borderBottom: '1px solid #f0f4f8',
  },
  avatar: {
    width: 48, height: 48, borderRadius: '50%',
    background: 'linear-gradient(135deg, #1a3a5c, #2a5080)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 700, flexShrink: 0,
  },
  name: { fontSize: 17, fontWeight: 700, color: '#0f2540' },
  username: { fontSize: 13, color: '#7a8fa6', marginTop: 2 },
  qrWrap: {
    padding: 16,
    background: '#fff',
    borderRadius: 16,
    border: '2px solid #e8edf2',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  },
  qrImage: { display: 'block', width: 240, height: 240 },
  qrNote: { width: '100%', textAlign: 'center' },
  qrId: {
    fontFamily: 'monospace', fontSize: 11, color: '#b0bec5',
    letterSpacing: '0.5px', marginBottom: 10,
    wordBreak: 'break-all',
  },
  noteText: {
    margin: 0, fontSize: 13, color: '#7a8fa6', lineHeight: 1.6,
  },
}
