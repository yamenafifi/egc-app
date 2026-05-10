import { useState, useEffect, useRef, useCallback } from 'react'
import { timesheetsAPI } from '@/services/api'
import toast from 'react-hot-toast'

// States: idle → scanning → employee_loaded → project_select → confirming → done
export default function QRScanPage() {
  const [state, setState] = useState('idle')
  const [manualId, setManualId] = useState('')
  const [employeeInfo, setEmployeeInfo] = useState(null)  // {employee, clock_status, is_clocked_in}
  const [projects, setProjects] = useState([])
  const [projectSearch, setProjectSearch] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  // Load projects when we reach project_select step
  useEffect(() => {
    if (state === 'project_select') {
      timesheetsAPI.listProjects({ search: projectSearch || undefined })
        .then(r => setProjects(r.data.projects))
        .catch(() => toast.error('Failed to load projects from ERPNext'))
    }
  }, [state, projectSearch])

  const loadEmployee = useCallback(async (employeeId) => {
    if (!employeeId?.trim()) return
    setLoading(true)
    try {
      const { data } = await timesheetsAPI.getQrInfo(employeeId.trim())
      setEmployeeInfo(data)
      setState('employee_loaded')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Employee not found')
      setState('idle')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleManualSubmit = (e) => {
    e.preventDefault()
    loadEmployee(manualId)
  }

  // QR scan: we detect the QR value via URL param (supervisor opens scan link from phone)
  // The QR code encodes: /scan?id=<employee_id>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const scannedId = params.get('id')
    if (scannedId) {
      loadEmployee(scannedId)
      // Clean up URL
      window.history.replaceState({}, '', '/timesheets/scan')
    }
  }, [loadEmployee])

  const handleClockAction = async () => {
    if (!employeeInfo) return
    setLoading(true)
    try {
      if (employeeInfo.is_clocked_in) {
        // Clock out
        await timesheetsAPI.clockOut(employeeInfo.employee.id, notes)
        toast.success(`${employeeInfo.employee.display_name} clocked out`)
        setState('done_out')
      } else {
        // Need project first
        setState('project_select')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClockIn = async () => {
    if (!selectedProject) return
    setLoading(true)
    try {
      await timesheetsAPI.clockIn(employeeInfo.employee.id, selectedProject.name, notes)
      toast.success(`${employeeInfo.employee.display_name} clocked in on ${selectedProject.project_name}`)
      setState('done_in')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Clock in failed')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setState('idle')
    setManualId('')
    setEmployeeInfo(null)
    setSelectedProject(null)
    setNotes('')
    setProjectSearch('')
  }

  // ── Render: Done states ────────────────────────────────────────────────────
  if (state === 'done_in' || state === 'done_out') {
    const isIn = state === 'done_in'
    return (
      <div style={styles.page}>
        <div style={styles.doneCard}>
          <div style={{ ...styles.doneIcon, background: isIn ? '#eaf8f0' : '#fdf0e8' }}>
            {isIn ? '✓' : '✓'}
          </div>
          <h2 style={styles.doneTitle}>
            {isIn ? 'Clocked In' : 'Clocked Out'}
          </h2>
          <div style={styles.doneName}>{employeeInfo?.employee?.display_name}</div>
          {isIn && selectedProject && (
            <div style={styles.doneProject}>📋 {selectedProject.project_name}</div>
          )}
          <div style={styles.doneTime}>{new Date().toLocaleTimeString()}</div>
          <button style={styles.primaryBtn} onClick={reset}>
            Scan Another Employee
          </button>
        </div>
      </div>
    )
  }

  // ── Render: Project select ─────────────────────────────────────────────────
  if (state === 'project_select') {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <button style={styles.backBtn} onClick={() => setState('employee_loaded')}>← Back</button>
            <h2 style={styles.cardTitle}>Select Project</h2>
          </div>
          <div style={styles.employeeBanner}>
            <div style={styles.miniAvatar}>
              {employeeInfo?.employee?.display_name?.[0]}
            </div>
            <span style={styles.miniName}>{employeeInfo?.employee?.display_name}</span>
            <span style={styles.clockInBadge}>Clock In</span>
          </div>

          <input
            style={styles.searchInput}
            placeholder="Search projects..."
            value={projectSearch}
            onChange={e => setProjectSearch(e.target.value)}
            autoFocus
          />

          <div style={styles.projectList}>
            {projects.length === 0 && (
              <div style={styles.emptyMsg}>No projects found in ERPNext</div>
            )}
            {projects.map(p => (
              <div
                key={p.name}
                style={{
                  ...styles.projectRow,
                  ...(selectedProject?.name === p.name ? styles.projectRowSelected : {})
                }}
                onClick={() => setSelectedProject(p)}
              >
                <div style={styles.projectName}>{p.project_name}</div>
                <div style={styles.projectMeta}>{p.name} · {p.status}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={styles.label}>Notes (optional)</label>
            <input
              style={styles.searchInput}
              placeholder="Any notes about this shift..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <button
            style={{ ...styles.primaryBtn, opacity: (!selectedProject || loading) ? 0.6 : 1, marginTop: 16 }}
            disabled={!selectedProject || loading}
            onClick={handleClockIn}
          >
            {loading ? 'Clocking in...' : `Clock In on ${selectedProject?.project_name || '...'}`}
          </button>
        </div>
      </div>
    )
  }

  // ── Render: Employee loaded ────────────────────────────────────────────────
  if (state === 'employee_loaded' && employeeInfo) {
    const { employee, clock_status, is_clocked_in } = employeeInfo
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <button style={styles.backBtn} onClick={reset}>← Back</button>
            <h2 style={styles.cardTitle}>Confirm Action</h2>
          </div>

          <div style={styles.employeeCard}>
            <div style={styles.bigAvatar}>{employee.display_name?.[0]}</div>
            <div style={styles.employeeDetails}>
              <div style={styles.empName}>{employee.display_name}</div>
              <div style={styles.empId}>{employee.username}</div>
              {employee.erp_employee_id && (
                <div style={styles.empErp}>{employee.erp_employee_id}</div>
              )}
            </div>
          </div>

          {is_clocked_in && clock_status ? (
            <div style={styles.clockedInBanner}>
              <div style={styles.clockedDot} />
              <div>
                <div style={styles.clockedLabel}>Currently clocked in</div>
                <div style={styles.clockedProject}>📋 {clock_status.project_name}</div>
                <div style={styles.clockedTime}>
                  Since {new Date(clock_status.clock_in).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.notClockedBanner}>
              <div style={styles.notClockedDot} />
              <div style={styles.notClockedLabel}>Not currently clocked in</div>
            </div>
          )}

          {is_clocked_in && (
            <div style={{ marginBottom: 16 }}>
              <label style={styles.label}>Notes (optional)</label>
              <input
                style={styles.searchInput}
                placeholder="Any notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          )}

          <button
            style={{
              ...styles.primaryBtn,
              background: is_clocked_in
                ? 'linear-gradient(135deg, #c0392b, #e74c3c)'
                : 'linear-gradient(135deg, #1a5c3a, #27ae60)',
              opacity: loading ? 0.7 : 1,
            }}
            onClick={handleClockAction}
            disabled={loading}
          >
            {loading ? 'Processing...' : is_clocked_in ? 'Clock Out' : 'Continue to Project Select →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Render: Idle / Manual entry ────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>QR Scanner</h1>
        <p style={styles.sub}>Scan an employee's QR code or enter their ID manually</p>
      </div>

      <div style={styles.card}>
        <div style={styles.scanInstructions}>
          <div style={styles.scanIcon}>📷</div>
          <div>
            <div style={styles.scanTitle}>Scan QR Code</div>
            <div style={styles.scanText}>
              On mobile, use a QR scanner app and open the link. The employee's details will load automatically.
            </div>
          </div>
        </div>

        <div style={styles.divider}><span style={styles.dividerText}>or enter manually</span></div>

        <form onSubmit={handleManualSubmit}>
          <label style={styles.label}>Employee Portal ID</label>
          <div style={styles.inputRow}>
            <input
              style={{ ...styles.searchInput, flex: 1 }}
              placeholder="Paste employee ID..."
              value={manualId}
              onChange={e => setManualId(e.target.value)}
            />
            <button
              type="submit"
              style={{ ...styles.primaryBtn, width: 'auto', padding: '11px 20px' }}
              disabled={!manualId.trim() || loading}
            >
              {loading ? '...' : 'Load'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: { padding: 32, fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 520 },
  header: { marginBottom: 28 },
  title: { margin: 0, fontSize: 24, fontWeight: 700, color: '#0f2540' },
  sub: { margin: '4px 0 0', fontSize: 14, color: '#7a8fa6' },
  card: {
    background: '#fff', borderRadius: 16, padding: 28,
    border: '1px solid #e8edf2', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
  },
  cardTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#0f2540' },
  backBtn: {
    background: 'none', border: 'none', color: '#7a8fa6',
    fontSize: 14, cursor: 'pointer', padding: '4px 0',
  },
  scanInstructions: {
    display: 'flex', gap: 14, alignItems: 'flex-start',
    background: '#f0f6ff', borderRadius: 10, padding: '14px 16px', marginBottom: 20,
  },
  scanIcon: { fontSize: 28, lineHeight: 1 },
  scanTitle: { fontWeight: 600, fontSize: 14, color: '#1a3a5c', marginBottom: 4 },
  scanText: { fontSize: 13, color: '#5a7090', lineHeight: 1.5 },
  divider: {
    textAlign: 'center', borderTop: '1px solid #e8edf2',
    margin: '20px 0', position: 'relative',
  },
  dividerText: {
    background: '#fff', padding: '0 12px',
    fontSize: 12, color: '#9aabba',
    position: 'relative', top: -10,
  },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#3d5266', marginBottom: 6 },
  searchInput: {
    width: '100%', padding: '11px 14px', borderRadius: 8,
    border: '1.5px solid #d0dae4', fontSize: 14, color: '#1a2d40',
    outline: 'none', boxSizing: 'border-box',
  },
  inputRow: { display: 'flex', gap: 8 },
  primaryBtn: {
    width: '100%', padding: '13px',
    background: 'linear-gradient(135deg, #1a3a5c, #2a5080)',
    color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
  // Employee loaded
  employeeCard: {
    display: 'flex', alignItems: 'center', gap: 16,
    background: '#f7f9fc', borderRadius: 12, padding: '16px',
    marginBottom: 20,
  },
  bigAvatar: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'linear-gradient(135deg, #1a3a5c, #2a5080)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 22, fontWeight: 700, flexShrink: 0,
  },
  empName: { fontSize: 17, fontWeight: 700, color: '#0f2540' },
  empId: { fontSize: 13, color: '#7a8fa6', marginTop: 2 },
  empErp: { fontSize: 12, color: '#b0bec5', marginTop: 2 },
  clockedInBanner: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: '#eaf8f0', borderRadius: 10, padding: '14px 16px',
    border: '1px solid #a8dfc0', marginBottom: 16,
  },
  clockedDot: {
    width: 10, height: 10, borderRadius: '50%',
    background: '#27ae60', flexShrink: 0, marginTop: 3,
  },
  clockedLabel: { fontWeight: 600, fontSize: 13, color: '#1a5c3a' },
  clockedProject: { fontSize: 13, color: '#2d7a4f', marginTop: 3 },
  clockedTime: { fontSize: 12, color: '#5a9a70', marginTop: 2 },
  notClockedBanner: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#f7f9fc', borderRadius: 10, padding: '12px 16px',
    border: '1px solid #d0dae4', marginBottom: 16,
  },
  notClockedDot: {
    width: 10, height: 10, borderRadius: '50%',
    background: '#b0bec5', flexShrink: 0,
  },
  notClockedLabel: { fontSize: 13, color: '#7a8fa6' },
  employeeBanner: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', background: '#f7f9fc', borderRadius: 10,
    marginBottom: 16,
  },
  miniAvatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: '#1a3a5c', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700,
  },
  miniName: { fontSize: 14, fontWeight: 600, color: '#1a2d40', flex: 1 },
  clockInBadge: {
    fontSize: 11, padding: '3px 8px', borderRadius: 20,
    background: '#eaf8f0', color: '#27ae60', fontWeight: 700,
  },
  projectList: {
    maxHeight: 240, overflowY: 'auto',
    border: '1px solid #e8edf2', borderRadius: 8, marginTop: 10,
  },
  projectRow: {
    padding: '12px 14px', cursor: 'pointer',
    borderBottom: '1px solid #f5f7fa', transition: 'background 0.1s',
  },
  projectRowSelected: { background: '#e8f0fb' },
  projectName: { fontWeight: 600, fontSize: 14, color: '#1a2d40' },
  projectMeta: { fontSize: 12, color: '#9aabba', marginTop: 2 },
  emptyMsg: { padding: 24, textAlign: 'center', color: '#b0bec5', fontSize: 13 },
  // Done
  doneCard: {
    background: '#fff', borderRadius: 20, padding: '48px 36px',
    border: '1px solid #e8edf2', boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
    maxWidth: 400, textAlign: 'center',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  },
  doneIcon: {
    width: 64, height: 64, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 28, fontWeight: 700, color: '#27ae60',
  },
  doneTitle: { margin: 0, fontSize: 22, fontWeight: 700, color: '#0f2540' },
  doneName: { fontSize: 16, color: '#3d5266' },
  doneProject: { fontSize: 14, color: '#7a8fa6' },
  doneTime: { fontSize: 13, color: '#9aabba' },
}
