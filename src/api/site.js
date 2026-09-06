import { request } from './client'

export function fetchSite() {
  return request('/site')
}

export function submitContact(payload) {
  return request('/contact', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function submitRecruitment(payload) {
  return request('/recruitment', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
