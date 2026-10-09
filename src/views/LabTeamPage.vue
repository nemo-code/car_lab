<template>
  <div v-if="team" class="lab-team-page">
    <section class="lab-team-banner"><img :src="team.image" :alt="team.name + '项目示意'" /><div class="lab-wrap"><span class="lab-eyebrow">团队方向 / {{ team.caption }}</span><h1>{{ team.name }}</h1><p>{{ team.intro }}</p><router-link class="lab-primary" :to="`/portal?mode=apply&team=${team.id}`">申请加入这个团队</router-link></div></section>
    <section class="lab-wrap lab-section lab-team-details"><div><span class="lab-eyebrow">从哪里开始</span><h2>在团队里，你会接触</h2><p>{{ team.practice }}</p></div><div class="lab-skill-list"><div v-for="(skill, index) in team.learn" :key="skill"><span>0{{ index + 1 }}</span><strong>{{ skill }}</strong></div></div></section>
    <section class="lab-band"><div class="lab-wrap lab-band-inner"><div><h2>先从公开内容了解方向</h2><p>公开资料可以直接浏览。项目代码、内部步骤等资料需要申请通过后，登录所属团队账号访问。</p></div><router-link class="lab-primary" to="/resources">浏览资源库</router-link></div></section>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { teams } from '../lab'
const route = useRoute()
const team = computed(() => teams.find(item => item.id === route.params.id))
</script>
