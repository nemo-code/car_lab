import { reactive } from 'vue'
import { fetchSite } from '../api/site'

const siteStore = reactive({
  data: null,
  status: 'idle',
  error: '',
  _pending: null,
  async loadSite(force = false) {
    if (this.data && !force) {
      return this.data
    }

    if (this.status === 'loading') {
      return this._pending || null
    }

    this.status = 'loading'
    this.error = ''

    this._pending = fetchSite()
      .then((response) => {
        this.data = response.data
        this.status = 'ready'
        return this.data
      })
      .catch((error) => {
        this.error = error?.message || 'Failed to load site content.'
        this.status = 'error'
        throw error
      })
      .finally(() => {
        this._pending = null
      })

    return this._pending
  },
})

export function useSiteStore() {
  return siteStore
}