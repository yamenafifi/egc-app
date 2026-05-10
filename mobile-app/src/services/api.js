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
  login: (username, password) => api.post('/auth/login', { username, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }),
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
  updatePermissions: (id, permissions, template_id) =>
    api.put(`/users/${id}/permissions`, { permissions, template_id }),
}

export const erpAPI = {
  ping: () => api.get('/erp/ping'),
  listEmployees: (params) => api.get('/erp/employees', { params }),
  getEmployee: (id) => api.get(`/erp/employees/${id}`),
  getEmployeeCard: (id) => api.get(`/erp/employees/${id}/card`),
  listProjects: (params) => api.get('/erp/projects', { params }),
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

export const timesheetsAPI = {
  getQrInfo: (employeeId) => api.get(`/timesheets/qr/${employeeId}`),
  clockStatus: (employeeId) => api.get(`/timesheets/clock-status/${employeeId}`),
  clockIn: (employee_id, project_id, notes) =>
    api.post('/timesheets/clock-in', { employee_id, project_id, notes }),
  clockOut: (employee_id, notes) =>
    api.post('/timesheets/clock-out', { employee_id, notes }),
  listProjects: (params) => api.get('/timesheets/projects', { params }),
  listEntries: (params) => api.get('/timesheets/entries', { params }),
  deleteEntry: (id) => api.delete(`/timesheets/entries/${id}`),
  listSubmissions: (params) => api.get('/timesheets/submissions', { params }),
  createSubmission: (entry_ids) =>
    api.post('/timesheets/submissions', { entry_ids }),
  getSubmission: (id) => api.get(`/timesheets/submissions/${id}`),
  approve: (id) => api.post(`/timesheets/submissions/${id}/approve`),
  reject: (id, note) => api.post(`/timesheets/submissions/${id}/reject`, { note }),
  pushToErp: (id) => api.post(`/timesheets/submissions/${id}/push`),
  manualEntry: (data) => api.post('/timesheets/manual-entry', data),
  deleteSubmission: (id) => api.delete(`/timesheets/submissions/${id}`),
}

export const settingsAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
}
