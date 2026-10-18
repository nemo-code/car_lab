import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import * as platform from './platform.js'

export const MAX_UPLOAD = 20 * 1024 * 1024
const formats = new Map(Object.entries({
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.md': 'text/plain', '.csv': 'text/csv', '.zip': 'application/zip',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
}))
function validImage(buffer, mime) {
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  if (mime === 'image/jpeg') return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))
  if (mime === 'image/webp') return buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WEBP'
  return true
}
export async function receiveFile(req, params, user) {
  const purpose = params.get('purpose'), name = params.get('name') || ''
  platform.uploadAllowed(user, purpose)
  if (!name || name.length > 180 || /[\\/\x00-\x1f\x7f]/.test(name) || name.startsWith('.')) throw new Error('文件名无效')
  const mime = formats.get(path.extname(name).toLowerCase())
  if (!mime) throw new Error('支持图片、PDF、Office 文档、TXT、Markdown、CSV、ZIP 和 MP4/WebM 视频')
  const declaredSize = Number(req.headers['content-length'])
  if (declaredSize > MAX_UPLOAD) throw new Error('Request too large')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_UPLOAD) throw new Error('Request too large')
    chunks.push(chunk)
  }
  if (!size) throw new Error('不能上传空文件')
  const buffer = Buffer.concat(chunks)
  if (!validImage(buffer, mime)) throw new Error('图片格式与扩展名不一致')
  const id = randomUUID(), filePath = path.join(platform.storageRoot, id)
  await fs.writeFile(filePath, buffer, { flag: 'wx', mode: 0o600 })
  try { return platform.saveUpload({ id, name, mime, size }, user, purpose) }
  catch (error) { await fs.unlink(filePath); throw error }
}
export async function sendFile(req, res, id, user) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return 404
  const file = platform.fileAccess(id, user)
  if (!file) return file === false ? 403 : 404
  let data
  try { data = await fs.readFile(path.join(platform.storageRoot, file.id)) }
  catch (error) { if (error.code === 'ENOENT') return 404; throw error }
  const inline = file.mime.startsWith('image/')
  res.writeHead(200, {
    'Content-Type': file.mime, 'Content-Length': data.length,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="download${path.extname(file.name)}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  })
  res.end(data)
  return 200
}

export async function discardFile(id, user) {
  const file = platform.discardUpload(id, user)
  if (!file) return false
  try { await fs.unlink(path.join(platform.storageRoot, file.id)) }
  catch(error) { if (error.code !== 'ENOENT') throw error }
  return true
}
