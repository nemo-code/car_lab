function list(value) {
  return Array.isArray(value) ? value : []
}

function assets(value) {
  return list(value).map((item) => {
    if (typeof item === 'string') return item
    if (!item || typeof item !== 'object') return null
    return { label: String(item.label || ''), path: String(item.path || item.url || '') }
  }).filter((item) => typeof item === 'string' ? item : item.path)
}

function uploadedAssets(value) {
  return list(value).filter(item => item && typeof item === 'object').map(item => ({
    id: String(item.id || ''),
    project_id: String(item.project_id || item.project || ''),
    kind: String(item.kind || ''),
    label: String(item.label || ''),
    source_type: String(item.source_type || item.source || ''),
    availability: String(item.availability || ''),
    legacy_path: String(item.legacy_path || ''),
    filename: String(item.filename || ''),
    size: Number(item.size || 0),
    mime: String(item.mime || ''),
    sort_order: Number(item.sort_order || 0),
    published: item.published === true || item.published === 1,
    url: String(item.url || ''),
  }))
}

export function normalizeProject(record) {
  if (!record) return null
  return {
    id: record.id || record.slug,
    legacy_id: record.legacy_id || record.legacyId || '',
    edition: record.edition || 'custom',
    slug: record.slug || record.id || '',
    group: record.group || record.group_label || record.project_group || '',
    group_label: record.group_label || record.group || record.project_group || '',
    category: record.category || 'software',
    categoryLabel: record.categoryLabel || record.category_label || '',
    title: record.title || '',
    subtitle: record.subtitle || '',
    summary: record.summary || '',
    tags: list(record.tags),
    highlights: list(record.highlights),
    outcomes: list(record.outcomes),
    tech: list(record.tech),
    members: record.members || record.members_text || '',
    media: assets(record.media),
    videos: assets(record.videos),
    files: assets(record.files),
    assets: uploadedAssets(record.assets),
    accent: record.accent || 'cyan',
    sort_order: Number(record.sort_order || record.sortOrder || 0),
    status: record.status || 'published',
    created_at: record.created || record.created_at || '',
    updated_at: record.updated || record.updated_at || '',
    published_at: record.published_at || '',
  }
}

export function projectPayload(data = {}) {
  return {
    legacy_id: String(data.legacy_id || data.legacyId || '').trim(),
    edition: String(data.edition || 'custom').trim(),
    slug: String(data.slug || '').trim().toLowerCase(),
    group: String(data.group || data.group_label || '').trim(),
    category: String(data.category || 'software').trim(),
    categoryLabel: String(data.categoryLabel || data.category_label || '').trim(),
    title: String(data.title || '').trim(),
    subtitle: String(data.subtitle || '').trim(),
    summary: String(data.summary || '').trim(),
    tags: list(data.tags),
    highlights: list(data.highlights),
    outcomes: list(data.outcomes),
    tech: list(data.tech),
    members: String(data.members || '').trim(),
    media: assets(data.media),
    videos: assets(data.videos),
    files: assets(data.files),
    accent: String(data.accent || 'cyan').trim(),
    sort_order: Number(data.sort_order || data.sortOrder || 0),
    status: String(data.status || 'published').trim(),
  }
}
