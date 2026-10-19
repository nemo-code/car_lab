const API_BASE = import.meta.env.VITE_API_BASE || '/api'

export async function request(path, options = {}) {
  const requestBody = options.body
  const isFormData = typeof FormData !== 'undefined' && requestBody instanceof FormData
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(!isFormData && requestBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
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

export function upload(path, body, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}${path}`)
    xhr.withCredentials = true
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      }
    }
    xhr.onerror = () => reject(new Error('上传失败，请检查网络后重试'))
    xhr.onabort = () => reject(new Error('上传已取消'))
    xhr.onload = () => {
      const contentType = xhr.getResponseHeader('content-type') || ''
      let payload
      try {
        payload = contentType.includes('application/json') ? JSON.parse(xhr.responseText) : xhr.responseText
      } catch {
        payload = null
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const message = payload && typeof payload === 'object' ? payload.message || '上传失败' : '上传失败'
        const error = new Error(message)
        error.status = xhr.status
        error.payload = payload
        reject(error)
        return
      }
      if (typeof onProgress === 'function') onProgress(100)
      resolve(payload)
    }
    xhr.send(body)
  })
}
