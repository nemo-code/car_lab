<template>
  <div class="projects-page">
    <section class="projects-hero">
      <div class="site-container projects-hero-inner">
        <div><p class="site-eyebrow">{{ projectContent.hero.eyebrow }}</p><h1>{{ projectContent.hero.title }}</h1><p>{{ projectContent.hero.subtitle }}</p></div>
        <a class="projects-hero-link" :href="projectContent.showcase.href"><span>{{ projectContent.showcase.label }}</span><strong aria-hidden="true">↗</strong></a>
        <img src="/projects/xiaoxueqi-2026/photos/硬件3.JPG" alt="学生团队搭建智能小车" />
      </div>
    </section>

    <section class="site-container projects-content">
      <div class="projects-toolbar">
        <div><p class="site-eyebrow">{{ projectContent.catalog.eyebrow }}</p><h2>{{ projectContent.catalog.title }}</h2></div>
        <label class="project-search"><span>{{ projectContent.catalog.searchLabel }}</span><input v-model="query" type="search" :placeholder="projectContent.catalog.searchPlaceholder" /></label>
      </div>

      <div class="project-filters" role="group" aria-label="项目分类">
        <button v-for="filter in filters" :key="filter.id" type="button" :class="{ 'is-selected': activeFilter === filter.id }" :aria-pressed="activeFilter === filter.id" @click="activeFilter = filter.id">{{ filter.label }}</button>
      </div>

      <p v-if="loading" class="projects-state" role="status">正在载入项目成果…</p>
      <p v-else-if="loadError" class="projects-state projects-state-error" role="alert">项目资料暂时无法加载，请稍后重试或进入完整成果展浏览。</p>
      <div v-else-if="visibleProjects.length" class="project-grid">
        <article v-for="(project, index) in visibleProjects" :key="project.id" class="project-card">
          <button class="project-cover" type="button" :aria-label="`查看${project.title}详情`" @click="openProject(project)">
            <img :src="cover(project)" :alt="`${project.title}项目实践照片`" loading="lazy" />
            <span class="project-group">{{ project.group }}</span><span class="cover-arrow" aria-hidden="true">↗</span>
          </button>
          <div class="project-card-content">
            <div class="project-card-meta"><span>{{ project.categoryLabel }}</span><span>0{{ index + 1 }}</span></div>
            <h3>{{ project.title }}</h3>
            <p class="project-subtitle">{{ project.subtitle }}</p>
            <p class="project-summary">{{ project.summary }}</p>
            <div class="project-tags"><span v-for="tag in project.tags.slice(0, 4)" :key="tag">{{ tag }}</span></div>
            <button class="project-detail-link" type="button" @click="openProject(project)">查看项目内容 <span aria-hidden="true">→</span></button>
          </div>
        </article>
      </div>
      <div v-else class="projects-state"><strong>{{ projectContent.empty.title }}</strong><p>{{ projectContent.empty.subtitle }}</p></div>
    </section>

    <div v-if="selectedProject" class="project-dialog-backdrop" @click.self="closeProject">
      <section ref="dialogPanel" class="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" tabindex="-1" @keydown="handleDialogKeydown">
        <button ref="dialogCloseButton" class="project-dialog-close" type="button" aria-label="关闭项目详情" @click="closeProject">×</button>
        <img class="project-dialog-image" :src="cover(selectedProject)" :alt="`${selectedProject.title}项目实践照片`" />
        <div class="project-dialog-content"><p class="site-eyebrow">{{ selectedProject.group }} · {{ selectedProject.categoryLabel }}</p><h2 id="project-dialog-title">{{ selectedProject.title }}</h2><p class="project-dialog-subtitle">{{ selectedProject.subtitle }}</p><p>{{ selectedProject.summary }}</p>
          <div class="project-dialog-columns"><div><h3>实践亮点</h3><ul><li v-for="highlight in selectedProject.highlights" :key="highlight">{{ highlight }}</li></ul></div><div><h3>技术与结果</h3><div class="project-tags"><span v-for="tech in selectedProject.tech" :key="tech">{{ tech }}</span></div><div class="project-outcomes"><span v-for="outcome in selectedProject.outcomes" :key="outcome">{{ outcome }}</span></div></div></div>
          <section v-if="projectImages(selectedProject).length || projectAssets(selectedProject, 'video').length || projectAssets(selectedProject, 'file').length" class="project-dialog-assets" aria-label="项目公开素材">
            <div v-if="projectImages(selectedProject).length"><h3>项目图片</h3><div class="project-media-gallery"><figure v-for="image in projectImages(selectedProject)" :key="image.url"><img :src="image.url" :alt="image.label || `${selectedProject.title}项目图片`" loading="lazy"><figcaption v-if="image.label">{{ image.label }}</figcaption></figure></div></div>
            <div v-if="projectAssets(selectedProject, 'video').length"><h3>视频成果</h3><ul class="project-asset-links"><li v-for="asset in projectAssets(selectedProject, 'video')" :key="asset.id"><a :href="asset.url" target="_blank" rel="noopener">{{ asset.label || asset.filename || '打开视频' }} ↗</a></li></ul></div>
            <div v-if="projectAssets(selectedProject, 'file').length"><h3>成果文件</h3><ul class="project-asset-links"><li v-for="asset in projectAssets(selectedProject, 'file')" :key="asset.id"><a :href="asset.url" target="_blank" rel="noopener" :download="asset.filename || undefined">{{ asset.label || asset.filename || '下载成果文件' }} ↗</a></li></ul></div>
          </section>
          <a class="project-detail-link" :href="projectContent.showcase.href">{{ projectContent.detailCta }} <span aria-hidden="true">↗</span></a>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { listProjects } from '../api/platform'
import { useSiteStore } from '../stores/site'
import { handleDialogKeydown as trapDialogFocus } from '../utils/accessibility'

const categories = {
  all: '全部项目',
  hardware: '硬件实物',
  software: '软件系统',
  game: '仿真交互',
}
const filters = Object.entries(categories).map(([id, label]) => ({ id, label }))
const projects = ref([])
const query = ref('')
const activeFilter = ref('all')
const selectedProject = ref(null)
const dialogCloseButton = ref(null), dialogPanel = ref(null)
const previousFocus = ref(null)
const loading = ref(true)
const loadError = ref(false)
const siteStore = useSiteStore()
const fallback = {
  hero: {
    eyebrow: '项目成果 / 2026 小学期',
    title: '从想法出发，做到可以演示。',
    subtitle: '浏览软件系统、硬件实物与仿真交互方向的学生项目。每一项成果都来自真实的实践过程。',
  },
  showcase: { label: '浏览完整成果展', href: '/projects/xiaoxueqi-2026/showcase-site/index.html' },
  catalog: { eyebrow: '项目目录', title: '看看大家正在实践什么', searchLabel: '搜索项目', searchPlaceholder: '项目名称、技术或方向' },
  empty: { title: '没有找到匹配项目', subtitle: '试试搜索“小车”“CAN”或“Unity”，也可以切换项目方向。' },
  detailCta: '在完整成果展中继续浏览',
}
const projectContent = computed(() => {
  const content = siteStore.data?.projects ?? {}
  return {
    ...fallback,
    ...content,
    hero: { ...fallback.hero, ...(content.hero ?? {}) },
    showcase: { ...fallback.showcase, ...(content.showcase ?? {}) },
    catalog: { ...fallback.catalog, ...(content.catalog ?? {}) },
    empty: { ...fallback.empty, ...(content.empty ?? {}) },
  }
})

onMounted(async () => {
  try {
    const result = await listProjects()
    projects.value = result.data || []
  } catch {
    try {
      const response = await fetch('/projects/xiaoxueqi-2026/showcase-site/data.json')
      if (!response.ok) throw new Error('Project data request failed')
      const result = await response.json()
      if (!Array.isArray(result)) throw new Error('Project data is invalid')
      projects.value = result
    } catch {
      loadError.value = true
    }
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => document.body.classList.remove('modal-open'))

function handleDialogKeydown(event) { trapDialogFocus(event, closeProject) }

const visibleProjects = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase()
  return projects.value.filter((project) => {
    const matchesCategory = activeFilter.value === 'all' || project.category === activeFilter.value
    const searchable = [project.group, project.categoryLabel, project.title, project.subtitle, project.summary, ...(project.tags ?? []), ...(project.tech ?? [])].join(' ').toLocaleLowerCase()
    return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery))
  })
})

function cover(project) {
  const uploaded = project.assets?.find(asset => asset.kind === 'image' && asset.published && asset.availability === 'available' && asset.url)
  if (uploaded?.url) return uploaded.url
  const media = project.media?.[0]
  const mediaPath = typeof media === 'string' ? media : media?.path
  if (!mediaPath || mediaPath.startsWith('../')) return '/picture6.png'
  if (/^(https?:|\/|data:)/.test(mediaPath)) return mediaPath
  return `/projects/xiaoxueqi-2026/showcase-site/${mediaPath}`
}

function mediaUrl(value) {
  const raw = typeof value === 'string' ? value : value?.path
  if (!raw || raw.startsWith('../')) return ''
  if (/^(https?:|\/|data:)/.test(raw)) return raw
  return `/projects/xiaoxueqi-2026/showcase-site/${raw}`
}

function projectImages(project) {
  const featured = cover(project)
  const legacy = (project.media || []).map(item => ({ label: typeof item === 'string' ? '' : item?.label || '', url: mediaUrl(item) }))
  const controlled = (project.assets || [])
    .filter(asset => asset.kind === 'image' && asset.published && asset.availability === 'available' && asset.url)
    .map(asset => ({ label: asset.label, url: asset.url }))
  const seen = new Set([featured])
  return [...legacy, ...controlled].filter(item => item.url && !seen.has(item.url) && seen.add(item.url))
}

function projectAssets(project, kind) {
  return (project.assets || []).filter(asset => asset.kind === kind && asset.published && asset.availability === 'available' && asset.url)
}

function openProject(project) {
  previousFocus.value = document.activeElement
  selectedProject.value = project
  document.body.classList.add('modal-open')
  nextTick(() => dialogCloseButton.value?.focus())
}

function closeProject() {
  if (!selectedProject.value) return
  selectedProject.value = null
  document.body.classList.remove('modal-open')
  nextTick(() => previousFocus.value?.focus())
}
</script>
