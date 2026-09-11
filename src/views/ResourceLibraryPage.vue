<template>
  <main class="resource-page">
    <section class="resource-hero">
      <div>
        <p class="eyebrow">SMART VEHICLE LAB · RESOURCE LIBRARY</p>
        <h1>{{ resources.hero.title }}</h1>
        <p class="hero-copy">{{ resources.hero.subtitle }}</p>
      </div>
      <div class="hero-mark" aria-hidden="true">
        <span>LAB</span>
        <strong>01</strong>
      </div>
    </section>

    <section class="resource-summary" aria-label="资源库概览">
      <div v-for="stat in summaryStats" :key="stat.label" class="summary-item">
        <strong>{{ stat.value }}</strong>
        <span>{{ stat.label }}</span>
      </div>
    </section>

    <section class="library-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">CATALOGUE</p>
          <h2>按设备与方向查找</h2>
        </div>
        <p class="result-count">显示 {{ filteredResources.length }} / {{ resources.items.length }} 条</p>
      </div>

      <div class="toolbar">
        <label class="search-box">
          <span>搜索资源</span>
          <input v-model="searchQuery" type="search" placeholder="输入名称、关键词或方向" />
        </label>

        <div class="category-tabs" role="tablist" aria-label="资源分类">
          <button
            v-for="category in categories"
            :key="category.value"
            type="button"
            :class="['category-tab', { selected: selectedCategory === category.value }]"
            :aria-selected="selectedCategory === category.value"
            role="tab"
            @click="selectedCategory = category.value"
          >
            {{ category.label }}
          </button>
        </div>
      </div>

      <div v-if="filteredResources.length" class="resource-grid">
        <article v-for="item in filteredResources" :key="item.id" class="resource-card">
          <div class="card-topline">
            <span class="resource-type">{{ item.type }}</span>
            <span :class="['status', item.status === '待上传' ? 'pending' : 'ready']">{{ item.status }}</span>
          </div>
          <h3>{{ item.title }}</h3>
          <p class="resource-summary">{{ item.summary }}</p>
          <div class="tag-list">
            <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
          </div>
          <div class="card-footer">
            <span>{{ item.level }}</span>
            <button type="button" class="detail-button" @click="selectedResource = item">查看条目</button>
          </div>
        </article>
      </div>

      <div v-else class="empty-state">
        <strong>没有匹配的资源</strong>
        <p>换一个关键词或选择“全部资源”继续查找。</p>
      </div>
    </section>

    <section class="workflow-band">
      <div>
        <p class="eyebrow">NEXT STEP</p>
        <h2>把实验资料沉淀成可复用的学习路径</h2>
      </div>
      <p>后续可继续接入 PDF、代码仓库、接线图、实验记录和项目模板，形成从设备认识到项目实践的完整资源链。</p>
    </section>

    <div v-if="selectedResource" class="detail-backdrop" @click.self="selectedResource = null">
      <aside class="detail-panel" aria-label="资源详情">
        <button type="button" class="close-button" aria-label="关闭资源详情" @click="selectedResource = null">×</button>
        <p class="eyebrow">{{ selectedResource.type }}</p>
        <h2>{{ selectedResource.title }}</h2>
        <p class="detail-description">{{ selectedResource.description }}</p>
        <dl class="detail-list">
          <div>
            <dt>适用设备</dt>
            <dd>{{ selectedResource.categoryLabel }}</dd>
          </div>
          <div>
            <dt>建议基础</dt>
            <dd>{{ selectedResource.level }}</dd>
          </div>
          <div>
            <dt>当前状态</dt>
            <dd>{{ selectedResource.status }}</dd>
          </div>
        </dl>
        <div class="detail-tags">
          <span v-for="tag in selectedResource.tags" :key="tag">{{ tag }}</span>
        </div>
      </aside>
    </div>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSiteStore } from '../stores/site'

const siteStore = useSiteStore()
const searchQuery = ref('')
const selectedCategory = ref('all')
const selectedResource = ref(null)

const fallback = {
  hero: {
    title: '实验室资源库',
    subtitle: '围绕智能座舱、方向盘与单片机设备，整理实验指南、项目资料和实践入口。',
  },
  categories: [],
  items: [],
}

const resources = computed(() => siteStore.data?.resources ?? fallback)
const categories = computed(() => [
  { value: 'all', label: '全部资源' },
  ...resources.value.categories,
])

const filteredResources = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return resources.value.items.filter((item) => {
    const matchesCategory = selectedCategory.value === 'all' || item.category === selectedCategory.value
    const searchable = [item.title, item.summary, item.description, item.categoryLabel, ...item.tags]
      .join(' ')
      .toLowerCase()
    return matchesCategory && (!query || searchable.includes(query))
  })
})

const summaryStats = computed(() => [
  { value: resources.value.items.length, label: '资源条目' },
  { value: resources.value.categories.length, label: '设备方向' },
  { value: resources.value.items.filter((item) => item.status === '可用').length, label: '基础内容' },
])
</script>

<style scoped>
.resource-page {
  min-height: 100vh;
  padding: 36px clamp(20px, 5vw, 80px) 64px;
  background: #f5f7f8;
  color: #17212b;
}

.resource-hero,
.library-section,
.workflow-band,
.resource-summary {
  max-width: 1240px;
  margin: 0 auto;
}

.resource-hero {
  display: flex;
  justify-content: space-between;
  gap: 32px;
  align-items: end;
  padding: 46px clamp(24px, 5vw, 72px);
  background: #123b3d;
  color: #f4f8f3;
  border-radius: 12px;
}

.eyebrow {
  margin: 0 0 12px;
  color: #8eb9a9;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.resource-hero h1,
.section-heading h2,
.workflow-band h2,
.detail-panel h2 {
  margin: 0;
  color: inherit;
  letter-spacing: 0;
}

.resource-hero h1 {
  font-size: clamp(2rem, 4vw, 3.5rem);
}

.hero-copy {
  max-width: 680px;
  margin: 16px 0 0;
  color: #d7e7df;
  line-height: 1.8;
}

.hero-mark {
  min-width: 112px;
  padding: 18px;
  border: 1px solid rgba(220, 244, 230, 0.34);
  color: #b7d9c6;
  text-align: right;
}

.hero-mark span,
.hero-mark strong {
  display: block;
}

.hero-mark span {
  font-size: 0.72rem;
  letter-spacing: 0.12em;
}

.hero-mark strong {
  margin-top: 8px;
  color: #fff;
  font-size: 2.1rem;
}

.resource-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  margin-top: 24px;
  background: #d9e0df;
  border: 1px solid #d9e0df;
}

.summary-item {
  display: grid;
  gap: 5px;
  padding: 20px 24px;
  background: #fff;
}

.summary-item strong {
  color: #123b3d;
  font-size: 1.75rem;
}

.summary-item span,
.result-count {
  color: #65727a;
  font-size: 0.9rem;
}

.library-section {
  margin-top: 56px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: end;
  margin-bottom: 22px;
}

.section-heading h2,
.workflow-band h2 {
  color: #17212b;
  font-size: clamp(1.5rem, 3vw, 2.25rem);
}

.result-count {
  margin: 0;
}

.toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid #d9e0df;
}

.search-box {
  display: grid;
  gap: 8px;
  min-width: min(100%, 360px);
  color: #40515a;
  font-size: 0.84rem;
  font-weight: 700;
}

.search-box input {
  min-height: 42px;
  padding: 0 13px;
  border: 1px solid #cbd7d5;
  border-radius: 6px;
  background: #fff;
  color: #17212b;
  font: inherit;
  font-weight: 400;
}

.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: end;
}

.category-tab,
.detail-button,
.close-button {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.category-tab {
  padding: 10px 13px;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #65727a;
}

.category-tab:hover,
.category-tab.selected {
  border-bottom-color: #2d7774;
  color: #123b3d;
}

.resource-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.resource-card {
  display: flex;
  min-height: 268px;
  flex-direction: column;
  padding: 22px;
  border: 1px solid #dce4e2;
  border-radius: 8px;
  background: #fff;
}

.card-topline,
.card-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.resource-type,
.status,
.tag-list span,
.detail-tags span {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 0.75rem;
}

.resource-type {
  color: #2d7774;
  font-weight: 700;
}

.status {
  padding: 4px 8px;
}

.status.ready {
  background: #e4f3eb;
  color: #19613d;
}

.status.pending {
  background: #fff3d8;
  color: #8a5b00;
}

.resource-card h3 {
  margin: 24px 0 10px;
  color: #17212b;
  font-size: 1.12rem;
}

.resource-summary {
  flex: 1;
  margin: 0;
  color: #65727a;
  line-height: 1.7;
}

.tag-list,
.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 18px;
}

.tag-list span,
.detail-tags span {
  padding: 5px 8px;
  background: #eef4f1;
  color: #3d6257;
}

.card-footer {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid #edf1f0;
  color: #849097;
  font-size: 0.82rem;
}

.detail-button {
  padding: 0;
  background: transparent;
  color: #236967;
  font-weight: 700;
}

.detail-button:hover {
  color: #123b3d;
  text-decoration: underline;
}

.empty-state {
  margin-top: 24px;
  padding: 48px 20px;
  border: 1px dashed #bccbc7;
  text-align: center;
}

.empty-state p {
  margin: 8px 0 0;
  color: #65727a;
}

.workflow-band {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-top: 64px;
  padding: 28px 0 0;
  border-top: 1px solid #cbd7d5;
}

.workflow-band p:last-child {
  margin: 0;
  color: #65727a;
  line-height: 1.8;
}

.detail-backdrop {
  position: fixed;
  z-index: 1100;
  inset: 0;
  display: flex;
  justify-content: end;
  background: rgba(10, 25, 28, 0.42);
}

.detail-panel {
  position: relative;
  width: min(100%, 460px);
  padding: 56px 32px 32px;
  overflow-y: auto;
  background: #fff;
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.16);
}

.detail-panel h2 {
  color: #17212b;
  font-size: 1.8rem;
}

.detail-description {
  margin: 16px 0 0;
  color: #65727a;
  line-height: 1.8;
}

.close-button {
  position: absolute;
  top: 18px;
  right: 24px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #eef4f1;
  color: #123b3d;
  font-size: 1.5rem;
  line-height: 1;
}

.detail-list {
  display: grid;
  gap: 14px;
  margin: 30px 0 0;
}

.detail-list div {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #edf1f0;
}

.detail-list dt {
  color: #849097;
}

.detail-list dd {
  margin: 0;
  color: #17212b;
  font-weight: 700;
  text-align: right;
}

@media (max-width: 900px) {
  .resource-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toolbar,
  .workflow-band {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .category-tabs {
    justify-content: start;
  }
}

@media (max-width: 620px) {
  .resource-hero {
    align-items: start;
    flex-direction: column;
  }

  .hero-mark {
    align-self: end;
  }

  .resource-summary,
  .resource-grid,
  .workflow-band {
    grid-template-columns: 1fr;
  }

  .section-heading {
    align-items: start;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
