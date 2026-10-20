import { request } from './client.js'

export function fetchSite() {
  return request('/site')
}
