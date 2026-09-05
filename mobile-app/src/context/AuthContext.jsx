import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI, settingsAPI } from '@/services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modules, setModules] = useState(null)

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await authAPI.me()
      setUser(data.user)
      return data.user
    } catch {
      setUser(null)
      return null
    }
  }, [])

  const fetchModules = useCallback(async () => {
    try { const { data } = await settingsAPI.getModules(); setModules(data.settings) }
    catch { setModules({}) }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      Promise.all([fetchMe(), fetchModules()]).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [fetchMe, fetchModules])

  const login = async (username, password) => {
    const { data } = await authAPI.login(username, password)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    setUser(data.user)
    fetchModules()
    return data.user
  }

  const logout = async () => {
    try { await authAPI.logout() } catch {}
    localStorage.clear()
    setUser(null)
  }

  const hasPermission = (node) => {
    if (!user) return false
    if (user.is_sysadmin) return true
    return user.permissions?.includes(node) ?? false
  }

  // Defaults to enabled while modules is still loading (null) or a given
  // key is absent, so a slow/failed fetch never hides a working feature.
  const isModuleEnabled = (key) => modules?.[`module_${key}_enabled`] ?? true

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, fetchMe, hasPermission, modules, isModuleEnabled, refetchModules: fetchModules }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
