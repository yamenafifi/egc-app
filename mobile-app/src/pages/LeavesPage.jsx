import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { c } from '@/theme'
import { Icon } from '@/components/Icons'
import { PageTopBar } from '@/components/ui/TopBar'
import { useIsMobile } from '@/hooks/useIsMobile'
import { leaveAPI } from '@/services/api'
import { normalizeLeaveRequest, sortByMostRecent } from '@/utils/requests'
import RequestRow from '@/components/requests/RequestRow'
import RequestDetailSheet from '@/components/requests/RequestDetailSheet'

export default function LeavesPage() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState(searchParams.get('tab') === 'team' ? 'team' : 'mine')
  const [mineItems, setMineItems] = useState(null)
  const [teamItems, setTeamItems] = useState(null)
  const [selected, setSelected] = useState(null)
  const [autoOpenChecked, setAutoOpenChecked] = useState(false)

  const loadMine = useCallback(async () => {
    try {
      const { data } = await leaveAPI.myRequests()
      setMineItems(sortByMostRecent(data.requests.map(normalizeLeaveRequest)))
    } catch {
      setMineItems([])
    }
  }, [])

  const loadTeam = useCallback(async () => {
    try {
      const { data } = await leaveAPI.teamRequests()
      setTeamItems(sortByMostRecent(data.requests.map(normalizeLeaveRequest)))
    } catch {
      setTeamItems([])
    }
  }, [])

  useEffect(() => { loadMine(); loadTeam() }, [loadMine, loadTeam])

  useEffect(() => {
    if (autoOpenChecked) return
    const list = tab === 'mine' ? mineItems : teamItems
    if (list === null) return
    const leaveId = searchParams.get('leave')
    if (leaveId) {
      const found = list.find(i => i.id === leaveId)
      if (found) setSelected({ item: found, mode: tab })
    }
    setAutoOpenChecked(true)
  }, [mineItems, teamItems, tab, searchParams, autoOpenChecked])

  const handleActioned = () => { loadMine(); loadTeam() }
  const handleTabChange = (key) => { setTab(key); setSearchParams({ tab: key }) }

  const activeItems = tab === 'mine' ? mineItems : teamItems

  const body = (
    <div style={{ maxWidth: 640 }}>
      <button onClick={() => navigate('/leave/new')} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '13px', borderRadius: 10, border: 'none', background: c.primaryDark, color: '#fff',
        fontFamily: c.font, fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16,
      }}>
        <Icon name="plus" size={15} color="#fff" /> Request a Leave
      </button>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['mine', 'My Leaves'], ['team', 'Team Leaves']].map(([key, label]) => (
          <button key={key} onClick={() => handleTabChange(key)} style={{
            flex: 1, textAlign: 'center', padding: '10px 0', cursor: 'pointer',
            background: tab === key ? c.primaryDark : '#fff',
            borderRadius: 10, fontSize: 13, fontWeight: 700,
            color: tab === key ? '#fff' : c.textSub,
            border: `1px solid ${tab === key ? c.primaryDark : c.border}`,
            fontFamily: c.font,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
        {activeItems === null ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>Loading…</div>
        ) : activeItems.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: c.textMuted, fontSize: 13 }}>
            {tab === 'mine' ? 'No leave requests yet' : 'No leave requests need your review'}
          </div>
        ) : (
          activeItems.map(item => (
            <RequestRow key={item.id} item={item} onClick={() => setSelected({ item, mode: tab })} />
          ))
        )}
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ minHeight: '100%', background: c.bg, fontFamily: c.font }}>
        <PageTopBar title="Leaves" />
        <div style={{ padding: '20px 16px 40px' }}>{body}</div>
        <RequestDetailSheet item={selected?.item} mode={selected?.mode} onClose={() => setSelected(null)} onActioned={handleActioned} />
      </div>
    )
  }

  return (
    <div style={{ fontFamily: c.font, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: c.text }}>Leaves</h1>
        <p style={{ margin: 0, fontSize: 13, color: c.textSub }}>Your leave requests, and anything awaiting your review.</p>
      </div>
      {body}
      <RequestDetailSheet item={selected?.item} mode={selected?.mode} onClose={() => setSelected(null)} onActioned={handleActioned} />
    </div>
  )
}
