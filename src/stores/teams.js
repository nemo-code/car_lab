import { reactive } from 'vue'
import { listAdminTeams, listTeams } from '../api/platform'
import { defaultTeams } from '../lab'

const teamStore = reactive({
  publicData: defaultTeams.map(team => ({ ...team })),
  adminData: [],
  status: 'idle',
  error: '',
  adminStatus: 'idle',
  adminError: '',
  _pending: null,
  _adminPending: null,
  async loadTeams(force = false) {
    if (this.status === 'loading') return this._pending || this.publicData
    if (this.status === 'ready' && !force) return this.publicData
    this.status = 'loading'
    this.error = ''
    this._pending = listTeams()
      .then(response => {
        this.publicData = Array.isArray(response?.data)
          ? response.data.filter(team => team?.id && team.enabled !== false)
          : []
        this.status = 'ready'
        return this.publicData
      })
      .catch(error => {
        this.error = error?.message || 'Failed to load teams.'
        this.status = 'error'
        return this.publicData
      })
      .finally(() => { this._pending = null })
    return this._pending
  },
  async loadAdminTeams(force = false) {
    if (this.adminStatus === 'loading') return this._adminPending || this.adminData
    if (this.adminStatus === 'ready' && !force) return this.adminData
    this.adminStatus = 'loading'
    this.adminError = ''
    this._adminPending = listAdminTeams()
      .then(response => {
        this.adminData = Array.isArray(response?.data)
          ? response.data.filter(team => team?.id)
          : []
        this.adminStatus = 'ready'
        return this.adminData
      })
      .catch(error => {
        this.adminError = error?.message || 'Failed to load teams.'
        this.adminStatus = 'error'
        return this.adminData
      })
      .finally(() => { this._adminPending = null })
    return this._adminPending
  },
})

export function useTeamsStore() {
  return teamStore
}

export function teamById(id) {
  return teamStore.publicData.find(team => team.id === id || team.code === id) || null
}
