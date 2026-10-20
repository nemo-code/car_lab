<template>
  <div v-if="teamsStore.status === 'idle' || teamsStore.status === 'loading'" class="lab-wrap lab-section lab-team-state" role="status">
    <span class="lab-eyebrow">团队方向</span>
    <h1>正在加载团队资料…</h1>
    <p>请稍候，正在准备团队介绍和实践方向。</p>
  </div>
  <div v-else-if="team" class="lab-team-page">
    <section class="lab-team-banner"><img :src="team.image" :alt="team.name + '项目示意'" /><div class="lab-wrap"><span class="lab-eyebrow">{{ teamCopy.bannerEyebrow }} / {{ team.caption }}</span><h1>{{ team.name }}</h1><p>{{ team.intro }}</p><router-link class="lab-primary" :to="`/portal?mode=apply&team=${team.id}`">{{ teamCopy.bannerCta }}</router-link></div></section>
    <section class="lab-wrap lab-section lab-team-details"><div><span class="lab-eyebrow">{{ teamCopy.details.eyebrow }}</span><h2>{{ teamCopy.details.title }}</h2><p>{{ team.practice }}</p></div><div class="lab-skill-list"><div v-for="(skill, index) in team.learn" :key="skill"><span>0{{ index + 1 }}</span><strong>{{ skill }}</strong></div></div></section>
    <section class="lab-band"><div class="lab-wrap lab-band-inner"><div><h2>{{ teamCopy.resource.title }}</h2><p>{{ teamCopy.resource.summary }}</p></div><router-link class="lab-primary" to="/resources">{{ teamCopy.resource.ctaLabel }}</router-link></div></section>
  </div>
  <div v-else class="lab-wrap lab-section lab-team-state" role="alert">
    <span class="lab-eyebrow">团队方向</span>
    <h1>没有找到这个团队</h1>
    <p>{{ teamsStore.error || '该团队可能已停用，或链接已经失效。' }}</p>
    <router-link class="lab-primary" to="/">返回实验室首页</router-link>
  </div>
</template>
<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTeamsStore } from '../stores/teams'
import { useSiteStore } from '../stores/site'
const route = useRoute()
const teamsStore = useTeamsStore()
const siteStore = useSiteStore()
const team = computed(() => teamsStore.publicData.find(item => item.id === route.params.id || item.code === route.params.id))
const fallback = {
  bannerEyebrow: '团队方向',
  bannerCta: '申请加入这个团队',
  details: { eyebrow: '从哪里开始', title: '在团队里，你会接触' },
  resource: {
    title: '先从公开内容了解方向',
    summary: '公开资料可以直接浏览。项目代码、内部步骤等资料需要申请通过后，登录所属团队账号访问。',
    ctaLabel: '浏览资源库',
  },
}
const teamCopy = computed(() => {
  const content = siteStore.data?.team ?? {}
  return {
    ...fallback,
    bannerEyebrow: content.bannerEyebrow || content.hero?.eyebrow || fallback.bannerEyebrow,
    bannerCta: content.bannerCta || content.hero?.ctaLabel || fallback.bannerCta,
    details: { ...fallback.details, ...(content.details ?? {}) },
    resource: {
      ...fallback.resource,
      ...(content.resource ?? {}),
      title: content.resource?.title || content.join?.title || fallback.resource.title,
      summary: content.resource?.summary || content.join?.summary || fallback.resource.summary,
    },
  }
})
onMounted(() => { teamsStore.loadTeams() })
</script>
