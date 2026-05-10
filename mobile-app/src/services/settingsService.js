// Client-side settings service
// Reads/writes system settings via the backend API
// Falls back to localStorage for optimistic UI

const SETTINGS_KEY = 'egc_system_settings'

export const defaultSettings = {
  qr_timesheet_enabled: true,   // if false → manual timesheet mode
}

export function getCachedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) }
  } catch {}
  return { ...defaultSettings }
}

export function cacheSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {}
}
