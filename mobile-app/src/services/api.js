import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refresh = localStorage.getItem('refresh_token')
        const { data } = await axios.post('/api/auth/refresh', {}, {
          headers: { Authorization: `Bearer ${refresh}` }
        })
        localStorage.setItem('access_token', data.access_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

export const authAPI = {
  login: (username, password) => {
    let device_uuid = localStorage.getItem('device_uuid')
    if (!device_uuid) {
      device_uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)
      localStorage.setItem('device_uuid', device_uuid)
    }
    const device_info = {
      device_uuid,
      userAgent: navigator.userAgent,
      platform: navigator.platform || (navigator.userAgentData && navigator.userAgentData.platform) || 'Unknown',
      language: navigator.language,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    return api.post('/auth/login', { username, password, device_info })
  },
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }),
  setInitialPassword: (new_password) =>
    api.post('/auth/set-initial-password', { new_password }),
  getDevices: () => api.get('/auth/devices'),
  revokeDevice: (id) => api.delete(`/auth/devices/${id}`),
}

export const usersAPI = {
  list: (params) => api.get('/users', { params }),
  get: (id) => api.get(`/users/${id}`),
  create: (erp_employee_id, initial_password) =>
    api.post('/users', { erp_employee_id, initial_password }),
  delete: (id) => api.delete(`/users/${id}`),
  deactivate: (id) => api.patch(`/users/${id}/deactivate`),
  reactivate: (id) => api.patch(`/users/${id}/reactivate`),
  resetPassword: (id, new_password) =>
    api.post(`/users/${id}/reset-password`, { new_password }),
  getPermissions: (id) => api.get(`/users/${id}/permissions`),
  getDevices: (id) => api.get(`/users/${id}/devices`),
  updatePermissions: (id, permissions, template_id) =>
    api.put(`/users/${id}/permissions`, { permissions, template_id }),
}

export const erpAPI = {
  ping: () => api.get('/erp/ping'),
  listEmployees: (params) => api.get('/erp/employees', { params }),
  getEmployee: (id) => api.get(`/erp/employees/${id}`),
  getEmployeeCard: (id) => api.get(`/erp/employees/${id}/card`),
  listProjects: (params) => api.get('/erp/projects', { params }),
  projectSites: () => api.get('/erp/project-sites'),
  updateProjectSupervisors: (projectId, employee_ids) =>
    api.put(`/erp/projects/${projectId}/supervisors`, { employee_ids }),
}

export const attendanceAPI = {
  sites: () => api.get('/attendance/sites'),
  myOpenRecord: () => api.get('/attendance/my-open-record'),
  clockIn: (payload) => api.post('/attendance/clock-in', payload),
  clockOut: (payload) => api.post('/attendance/clock-out', payload),
  myRecords: () => api.get('/attendance/my-records'),
  createSubmission: (record_ids) => api.post('/attendance/submissions', { record_ids }),
  teamSubmissions: () => api.get('/attendance/team-submissions'),
  getSubmission: (id) => api.get(`/attendance/submissions/${id}`),
  approveSubmission: (id, body) => api.post(`/attendance/submissions/${id}/approve`, body),
  rejectSubmission: (id, review_note) =>
    api.post(`/attendance/submissions/${id}/reject`, { review_note }),
}

export const leaveAPI = {
  types: () => api.get('/leave/types'),
  create: (payload) => api.post('/leave/requests', payload),
  myRequests: () => api.get('/leave/requests'),
  teamRequests: () => api.get('/leave/requests/team'),
  get: (id) => api.get(`/leave/requests/${id}`),
  approve: (id, remarks) => api.post(`/leave/requests/${id}/approve`, { remarks }),
  reject: (id, remarks) => api.post(`/leave/requests/${id}/reject`, { remarks }),
}

export const notificationsAPI = {
  list: (params) => api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
  vapidPublicKey: () => api.get('/notifications/vapid-public-key'),
  pushSubscribe: (subscription) => api.post('/notifications/push-subscribe', subscription),
  pushUnsubscribe: (endpoint) => api.delete('/notifications/push-subscribe', { data: { endpoint } }),
}

export const templatesAPI = {
  list: () => api.get('/permission-templates'),
  get: (id) => api.get(`/permission-templates/${id}`),
  create: (data) => api.post('/permission-templates', data),
  update: (id, data) => api.put(`/permission-templates/${id}`, data),
  delete: (id) => api.delete(`/permission-templates/${id}`),
  apply: (templateId, userId) =>
    api.post(`/permission-templates/${templateId}/apply/${userId}`),
}

export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
}
