const maxPayloadLength = 100000

const text = (maxLength, format, allowEmpty = false) => ({ type: 'string', maxLength, minLength: allowEmpty ? 0 : 1, ...(format ? { format } : {}) })
const object = (required, properties) => ({ type: 'object', required, properties })
const array = (items, maxItems = 200) => ({ type: 'array', items, maxItems })
const stringItems = text(500)
const link = text(1000, 'siteLink')
const asset = text(1000, 'siteAsset')

const schemas = {
  brand: object(['name', 'tagline', 'email', 'phone', 'address'], {
    name: text(120), tagline: text(200), email: text(254, undefined, true), phone: text(80, undefined, true), address: text(300),
  }),
  navigation: array(object(['path', 'label'], { path: text(500, 'sitePath'), label: text(80) }), 30),
  footer: object(['links', 'socials'], {
    links: array(object(['label', 'path'], { label: text(80), path: text(500, 'siteLink') }), 30),
    socials: array(object(['label', 'url'], { label: text(80), url: link }), 20),
  }),
  home: object(['hero'], {
    hero: object(['title', 'subtitle', 'image', 'imageAlt'], {
      eyebrow: text(160), title: text(200), subtitle: text(2000), indexLabel: text(100), image: asset, imageAlt: text(300),
    }),
    intro: object([], { eyebrow: text(160), title: text(200), subtitle: text(1200) }),
    showcase: object([], {
      eyebrow: text(160), title: text(200), subtitle: text(1200), ctaLabel: text(100), href: link,
      photos: array(object(['src', 'alt', 'caption'], { src: asset, alt: text(300), caption: text(200) }), 12),
    }),
    join: object([], {
      eyebrow: text(160), title: text(200), subtitle: text(1200), steps: array(stringItems, 12), ctaLabel: text(100), href: link,
    }),
    featuredProjects: array(object(['name', 'category', 'summary'], { name: text(200), category: text(100), summary: text(1000) }), 30),
    teamHighlights: array(object(['name', 'role'], { name: text(120), role: text(500) }), 30),
    services: array(object(['title', 'summary'], { title: text(160), summary: text(800) }), 30),
  }),
  about: object(['hero', 'story', 'mission', 'values', 'advisors', 'achievements'], {
    hero: object(['title', 'subtitle'], { title: text(200), subtitle: text(1500), image: asset, imageAlt: text(300) }),
    story: array(stringItems, 30), mission: array(stringItems, 30), values: array(text(160), 20),
    advisors: array(object(['name', 'role'], { name: text(120), role: text(500) }), 30),
    achievements: array(text(500), 30),
  }),
  projects: object(['hero', 'items'], {
    hero: object(['title', 'subtitle'], { eyebrow: text(160), title: text(200), subtitle: text(1500) }),
    items: array(object(['name', 'category', 'summary'], { name: text(200), category: text(100), summary: text(1000), stack: array(text(100), 30) }), 100),
    showcase: object([], { label: text(100), href: link }),
    catalog: object([], { eyebrow: text(160), title: text(200), searchLabel: text(100), searchPlaceholder: text(200) }),
    empty: object([], { title: text(200), subtitle: text(500) }),
    detailCta: text(160),
  }),
  resources: object(['hero', 'categories', 'items'], {
    hero: object(['title', 'subtitle'], { title: text(200), subtitle: text(1500) }),
    categories: array(object(['value', 'label'], { value: text(80), label: text(120) }), 50),
    items: array(object(['id', 'category', 'categoryLabel', 'type', 'title', 'summary', 'description', 'level', 'status', 'tags'], {
      id: text(120), category: text(80), categoryLabel: text(120), type: text(100), title: text(200),
      summary: text(1000), description: text(2000), level: text(80), status: text(80), tags: array(text(100), 30),
    }), 200),
  }),
  services: object(['hero'], {
    hero: object([], { eyebrow: text(160), title: text(200), subtitle: text(1500), image: asset, imageAlt: text(300) }),
    specialties: array(object(['title', 'summary'], { title: text(160), summary: text(800) }), 30),
    largeModel: object([], {
      title: text(200), subtitle: text(1000), intro: text(1500),
      items: array(object(['title', 'summary'], { title: text(160), summary: text(800) }), 30),
      learningOutcome: array(text(500), 30),
    }),
    process: array(text(500), 30), testimonials: array(text(1000), 30),
  }),
  team: object(['hero', 'members', 'join', 'life'], {
    hero: object(['title'], { eyebrow: text(160), title: text(200), subtitle: text(1000), image: asset, imageAlt: text(300) }),
    members: array(object(['name', 'role', 'bio'], { name: text(120), role: text(300), bio: text(1000) }), 100),
    join: object(['title', 'summary'], { title: text(200), summary: text(1000) }),
    life: array(text(300), 50),
    bannerEyebrow: text(160), bannerCta: text(100),
    details: object([], { eyebrow: text(160), title: text(200) }),
    resource: object([], { title: text(200), summary: text(1000), ctaLabel: text(100) }),
  }),
  contact: object(['hero', 'channels', 'note'], {
    hero: object(['title', 'subtitle'], { title: text(200), subtitle: text(1200) }),
    channels: array(object(['label', 'value'], { label: text(120), value: text(500) }), 20),
    note: text(1000),
  }),
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]'
}

function isSafePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 1000 &&
    !/[\\\u0000-\u0020\u007f]/.test(value) && value.startsWith('/') && !value.startsWith('//') &&
    !value.split(/[?#]/, 1)[0].split('/').some(part => part === '.' || part === '..')
}

function isSafeHttps(value) {
  if (typeof value !== 'string' || /[\\\u0000-\u0020\u007f]/.test(value)) return false
  const match = /^https:\/\/([^/?#]+)(?:[/?#][^\s]*)?$/i.exec(value)
  return Boolean(match && !match[1].includes('@') && /^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(match[1]))
}

function isSafeAsset(value) {
  if (isSafePath(value)) return true
  return value.length <= 1000 && isSafeHttps(value)
}

function isSafeLink(value) {
  if (isSafePath(value)) return true
  if (typeof value !== 'string' || /[\\\u0000-\u0020\u007f]/.test(value)) return false
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) return true
  if (/^tel:\+?[0-9(). -]{3,40}$/i.test(value)) return true
  return isSafeHttps(value)
}

function utf8Length(value) {
  let length = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x7f) length += 1
    else if (code <= 0x7ff) length += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) { length += 4; index += 1 }
      else length += 3
    } else length += 3
    if (length > maxPayloadLength) return length
  }
  return length
}

function checkNode(value, schema, path, errors) {
  const type = schema.type
  const valid = type === 'object' ? isPlainObject(value)
    : type === 'array' ? Array.isArray(value)
    : type === 'string' ? typeof value === 'string'
        : type === 'integer' ? Number.isInteger(value)
          : type === 'boolean' ? typeof value === 'boolean'
            : false
  if (!valid) {
    errors.push(path + ' 应为' + ({ object: '对象', array: '数组', string: '文本', integer: '整数', boolean: '布尔值' }[type] || '有效值'))
    return
  }
  if (type === 'string') {
    if (value.length < schema.minLength) errors.push(path + ' 不能为空')
    if (value.length > schema.maxLength) errors.push(path + ' 不能超过 ' + schema.maxLength + ' 个字符')
    if (schema.format === 'sitePath' && !isSafePath(value)) errors.push(path + ' 必须是站内路径')
    if (schema.format === 'siteAsset' && !isSafeAsset(value)) errors.push(path + ' 必须是站内资源路径或 HTTPS 地址')
    if (schema.format === 'siteLink' && !isSafeLink(value)) errors.push(path + ' 必须是安全的站内路径、HTTPS、邮箱或电话链接')
  } else if (type === 'array') {
    if (value.length > schema.maxItems) errors.push(path + ' 条目过多')
    value.forEach((item, index) => checkNode(item, schema.items, path + '[' + index + ']', errors))
  } else if (type === 'object') {
    schema.required.forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(path + '.' + key + ' 缺失')
    })
    Object.keys(value).forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) errors.push(path + '.' + key + ' 不受支持')
    })
    Object.keys(schema.properties).forEach(key => {
      if (Object.prototype.hasOwnProperty.call(value, key)) checkNode(value[key], schema.properties[key], path + '.' + key, errors)
    })
  }
}

function validateSiteSection(section, value) {
  const schema = schemas[section]
  if (!schema) throw new Error('官网内容区块无效')
  const errors = []
  checkNode(value, schema, section, errors)
  if (errors.length) throw new Error('官网内容结构无效：' + errors[0])
  return value
}

function validateSitePayload(payload) {
  if (!isPlainObject(payload)) throw new Error('官网内容必须是对象')
  let serialized
  try { serialized = JSON.stringify(payload) } catch (_) { throw new Error('官网内容无法序列化') }
  if (!serialized || utf8Length(serialized) > maxPayloadLength) {
    throw new Error('官网内容不能超过 100 KB')
  }
  const sections = Object.keys(schemas)
  for (const section of sections) {
    if (!Object.prototype.hasOwnProperty.call(payload, section)) throw new Error('官网内容区块不完整：' + section)
    validateSiteSection(section, payload[section])
  }
  return payload
}

function validateSitePayloadSize(payload) {
  let serialized
  try { serialized = JSON.stringify(payload) } catch (_) { throw new Error('官网内容无法序列化') }
  if (!serialized || utf8Length(serialized) > maxPayloadLength) {
    throw new Error('官网内容不能超过 100 KB')
  }
}

module.exports = {
  maxPayloadLength,
  siteSections: Object.keys(schemas),
  validateSiteSection,
  validateSitePayload,
  validateSitePayloadSize,
}
