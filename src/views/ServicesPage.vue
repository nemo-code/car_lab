<template>
  <div class="practice-page">
    <section class="practice-hero">
      <div class="site-container practice-hero-grid">
        <div><p class="site-eyebrow">实验室 / 实践方向</p><h1>你可以从这里，<br /><span>开始做项目。</span></h1><p>实验室把设备、代码、算法和交互放在同一条实践链路里，让每个人都能找到适合自己的切入口。</p></div>
        <img :src="services.hero.image" :alt="services.hero.imageAlt" />
      </div>
    </section>
    <section class="site-container practice-content">
      <div class="section-kicker"><span>01</span><span>可以做什么</span></div>
      <div class="practice-grid"><article v-for="item in services.specialties" :key="item.title"><span class="practice-number">01</span><h2>{{ item.title }}</h2><p>{{ item.summary }}</p></article></div>
      <div class="practice-lab"><div><p class="site-eyebrow">大模型与智能车载</p><h2>把智能能力接到真实场景里。</h2><p>{{ services.largeModel.intro }}</p></div><div class="practice-points"><span v-for="(item, index) in services.largeModel.items" :key="item.title"><b>0{{ index + 1 }}</b>{{ item.title }}</span></div></div>
      <div class="practice-process"><div><p class="site-eyebrow">从想法到成果</p><h2>一段清晰的项目路径。</h2></div><ol><li v-for="(step, index) in services.process" :key="step"><span>0{{ index + 1 }}</span>{{ step }}</li></ol></div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSiteStore } from '../stores/site'

const siteStore = useSiteStore()
const fallback = { hero: { image: '/picture6.png', imageAlt: '智能车辆与实验设备示意' }, specialties: [], process: [], largeModel: { title: '大模型与智能车载', intro: '探索大模型、机器视觉与嵌入式设备的结合，做出可运行的 AI 原型。', items: [] } }
const services = computed(() => ({ ...fallback, ...(siteStore.data?.services ?? {}), hero: { ...fallback.hero, ...(siteStore.data?.services?.hero ?? {}) }, largeModel: { ...fallback.largeModel, ...(siteStore.data?.services?.largeModel ?? {}) } }))
</script>
