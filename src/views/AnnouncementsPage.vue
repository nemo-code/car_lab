<template>
  <div class="lab-wrap lab-section announcements-page">
    <div class="lab-heading">
      <span class="lab-eyebrow">实验室动态</span>
      <h1>{{ detail ? detail.title : '新闻公告' }}</h1>
      <p>{{ detail ? detail.summary : '了解实验室的开放日、项目进展与最新通知。' }}</p>
    </div>
    <p v-if="error" class="lab-error" role="alert">{{ error }}</p>
    <div v-if="loading" class="lab-notice">正在加载…</div>
    <article v-else-if="detail" class="lab-panel announcement-detail">
      <div class="announcement-meta"><span>{{ kindText(detail.kind) }}</span><time>{{ formatDate(detail.published_at || detail.updated_at) }}</time></div>
      <pre class="announcement-body">{{ detail.body }}</pre>
      <router-link class="lab-outline" to="/announcements">返回公告列表</router-link>
    </article>
    <section v-else class="announcement-list" aria-label="公告列表">
      <p v-if="!items.length" class="lab-empty">暂无已发布公告。</p>
      <router-link v-for="item in items" :key="item.id" class="announcement-card" :to="`/announcements/${item.slug}`">
        <div class="announcement-meta"><span>{{ item.pinned ? '置顶 · ' : '' }}{{ kindText(item.kind) }}</span><time>{{ formatDate(item.published_at || item.updated_at) }}</time></div>
        <h2>{{ item.title }}</h2>
        <p>{{ item.summary }}</p>
        <span class="announcement-more">阅读详情 →</span>
      </router-link>
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import * as api from '../api/platform'

const route = useRoute()
const items = ref([])
const detail = ref(null)
const loading = ref(true)
const error = ref('')

function kindText(kind) { return kind === 'news' ? '新闻' : '通知' }
function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    if (route.params.slug) detail.value = (await api.readAnnouncement(route.params.slug)).data
    else { detail.value = null; items.value = (await api.listAnnouncements()).data }
  } catch (e) {
    detail.value = null
    error.value = e.message || '公告暂时无法加载'
  } finally { loading.value = false }
}
onMounted(load)
watch(() => route.params.slug, load)
</script>
