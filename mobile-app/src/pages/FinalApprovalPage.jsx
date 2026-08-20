import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { attendanceAPI } from '@/services/api'
import { normalizeSubmission } from '@/utils/requests'
import { StatusBadge } from '@/components/requests/RequestRow'
import RequestDetailSheet from '@/components/requests/RequestDetailSheet'

export default function FinalApprovalPage() {
  const isMobile = useIsMobile()

  const [items, setItems] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [detailItem, setDetailItem] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data } = await attendanceAPI.pendingFinalApproval()
      const normalized = data.submissions.map(normalizeSubmission)
      setItems(normalized)
      setSelected(prev => new Set([...prev].filter(id => normalized.some(i => i.id === id))))
    } catch {
      toast.error('Failed to load pending submissions')
      setItems([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const toggleAll = () => {
    if (!items) return
    setSelected(prev => prev.size === items.length ? new Set() : new Set(items.map(i => i.id)))
  }

  const handleApproveSelected = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const { data } = await attendanceAPI.finalApprove([...selected])
      const failed = data.results.filter(r => !r.ok)
      const pushFailed = data.results.filter(r => r.ok && r.push_status !== 'pushed')
      if (failed.length === 0 && pushFailed.length === 0) {
        toast.success(`${data.results.length} submission${data.results.length !== 1 ? 's' : ''} approved and pushed`)
      } else {
        toast.error(`${data.results.length - failed.length - pushFailed.length} pushed cleanly, ${pushFailed.length} had a payroll push issue, ${failed.length} failed`)
      }
      setSelected(new Set())
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to approve')
    } finally {
      setBusy(false)
    }
  }

  const handleRejectSelected = async () => {
    if (!rejectNote.trim()) {
      toast.error('A reason is required to reject.')
      return
    }
    setBusy(true)
    try {
      await attendanceAPI.finalReject([...selected], rejectNote)
      toast.success(`${selected.size} submission${selected.size !== 1 ? 's' : ''} rejected`)
      setSelected(new Set())
      setRejecting(false)
      setRejectNote('')
      load()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to reject')
    } finally {
      setBusy(false)
    }
  }

  const body = (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {items === null ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Nothing awaiting final approval</div>
        ) : (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderBottom: `1px solid ${c.bg}`, cursor: 'pointer', background: c.surfaceRaised }}>
              <input type="checkbox" checked={selected.size === items.length} onChange={toggleAll} />
              <span style={{ fontSize: 12, fontWeight: 700, color: c.textSub }}>
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
              </span>
            </label>
            {items.map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                borderBottom: `1px solid ${c.bg}`,
              }}>
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
                <button onClick={() => setDetailItem(item)} style={{
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10,
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: c.font,
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="clock" size={14} color={c.textSub} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.text }}>{item.raw.display_name}</div>
                    <div style={{ fontSize: 11, color: c.textMuted, marginTop: 1 }}>{item.title} · {item.subtitle}</div>
                  </div>
                </button>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </>
        )}
      </div>

      {items?.length > 0 && (
        rejecting ? (
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.text, marginBottom: 8 }}>
              Reject {selected.size} submission{selected.size !== 1 ? 's' : ''}
            </div>
            <textarea
              placeholder="Reason for rejecting (required)" value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3}
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${c.border}`, borderRadius: 8, fontSize: 13, fontFamily: c.font, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => { setRejecting(false); setRejectNote('') }} style={{
                flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${c.border}`, background: c.surface, color: c.textSub,
                fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: c.font,
              }}>Cancel</button>
              <button onClick={handleRejectSelected} disabled={busy} style={{
                flex: 1, padding: '11px', borderRadius: 9, border: `1px solid ${c.redBorder}`, background: c.redBg, color: c.red,
                fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: c.font, opacity: busy ? 0.7 : 1,
              }}>{busy ? 'Rejecting…' : 'Confirm Reject'}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, position: isMobile ? 'sticky' : 'static', bottom: 16 }}>
            <button onClick={() => setRejecting(true)} disabled={selected.size === 0 || busy} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px', borderRadius: 10,
              border: `1px solid ${c.redBorder}`, background: c.redBg, color: c.red, fontSize: 14, fontWeight: 700,
              cursor: selected.size === 0 ? 'default' : 'pointer', fontFamily: c.font, opacity: selected.size === 0 ? 0.5 : 1,
            }}>
              <Icon name="xCircle" size={15} color={c.red} /> Reject {selected.size > 0 ? selected.size : ''}
            </button>
            <button onClick={handleApproveSelected} disabled={selected.size === 0 || busy} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '13px', borderRadius: 10,
              border: 'none', background: c.green, color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: selected.size === 0 ? 'default' : 'pointer', fontFamily: c.font, opacity: selected.size === 0 ? 0.5 : 1,
            }}>
              <Icon name="checkCircle" size={15} color="#fff" /> {busy ? 'Approving…' : `Approve ${selected.size > 0 ? selected.size : ''}`}
            </button>
          </div>
        )
      )}
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Final Approval" />
        <div style={{ padding: '20px 16px 40px' }}>{body}</div>
        <RequestDetailSheet item={detailItem} mode="final" onClose={() => setDetailItem(null)} onActioned={load} />
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Final Approval</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>Supervisor-approved submissions awaiting final approval before they reach payroll.</p>
      </div>
      {body}
      <RequestDetailSheet item={detailItem} mode="final" onClose={() => setDetailItem(null)} onActioned={load} />
    </div>
  )
}
