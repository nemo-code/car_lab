const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const contentType = response.headers.get('content-type') || ''
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message = typeof body === 'object' && body
      ? body.message || 'Request failed'
      : 'Request failed'
    throw new Error(message)
  }

  return body
}
