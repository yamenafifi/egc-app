import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Icon } from '@/components/Icons'
import { PageHeader, Panel, SecondaryButton } from '@/desktop/components/Page'

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <div className="text-xs text-slate-400 font-medium shrink-0">{label}</div>
      <div className="text-sm text-slate-700 font-medium text-right">{value}</div>
    </div>
  )
}

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [photoErr, setPhotoErr] = useState(false)

  const initials = user?.display_name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?'
  // Already a full URL - resolved server-side (auth_service.py) against
  // the live-configured ERPNext base URL, never rebuilt here.
  const photoSrc = user?.erp_photo_url
  const handleLogout = async () => { await logout(); navigate('/login') }

  return (
    <div>
      <PageHeader title="Profile" />
      <div className="grid grid-cols-3 gap-5 max-w-4xl">
        <Panel>
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="w-20 h-20 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-2xl font-semibold text-slate-500 overflow-hidden shrink-0">
              {photoSrc && !photoErr
                ? <img src={photoSrc} alt="" onError={() => setPhotoErr(true)} className="w-full h-full object-cover" />
                : initials}
            </div>
            <div className="text-center">
              <div className="text-[15px] font-semibold text-slate-900">{user?.en_display_name || user?.display_name}</div>
              {user?.en_display_name && <div className="text-xs text-slate-400 mt-0.5" dir="rtl">{user.display_name}</div>}
              {(user?.designation_en || user?.designation) && <div className="text-xs text-slate-400 mt-1">{user.designation_en || user.designation}</div>}
            </div>
            <div className="flex flex-col gap-2 w-full mt-2">
              <SecondaryButton onClick={() => navigate('/settings')} icon={<Icon name="settings" size={13} />}>Settings</SecondaryButton>
              <SecondaryButton tone="danger" onClick={handleLogout} icon={<Icon name="logout" size={13} />}>Log Out</SecondaryButton>
            </div>
          </div>
        </Panel>

        <div className="col-span-2 flex flex-col gap-5">
          <Panel title="Employee Details">
            <InfoRow label="Full Name (EN)" value={user?.en_display_name || user?.display_name} />
            <InfoRow label="Full Name (AR)" value={user?.display_name} />
            <InfoRow label="Employee ID" value={user?.erp_employee_id} />
            <InfoRow label="Designation" value={user?.designation_en || user?.designation} />
            <InfoRow label="Department" value={user?.department} />
            <InfoRow label="Department (AR)" value={user?.department_ar} />
          </Panel>

          <Panel title="Contact Information">
            <InfoRow label="Username" value={user?.username} />
            <InfoRow label="IQAMA No." value={user?.iqama_number} />
          </Panel>
        </div>
      </div>
    </div>
  )
}
