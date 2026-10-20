<template>
  <div class="about-page">
    <section class="about-hero">
      <div class="site-container about-hero-grid">
        <div>
          <p class="site-eyebrow">实验室 / 关于我们</p>
          <h1>{{ about.hero.title || '把学习变成一段真实的工程经历。' }}</h1>
          <p class="about-lead">{{ about.hero.subtitle || '围绕智能车辆、车载嵌入式、机器视觉与仿真交互，做能被验证、被复用、被展示的学生项目。' }}</p>
        </div>
        <figure class="about-hero-media"><img :src="about.hero.image" :alt="about.hero.imageAlt" /><figcaption>在真实项目中学习协作与交付</figcaption></figure>
      </div>
    </section>

    <section class="site-container about-story">
      <div class="section-kicker"><span>01</span><span>我们是谁</span></div>
      <div class="about-story-grid">
        <div><h2>从硬件装配到交互呈现，<br />每一步都值得被看见。</h2></div>
        <div class="about-copy"><p v-for="item in about.story" :key="item">{{ item }}</p></div>
      </div>
    </section>

    <section class="about-mission">
      <div class="site-container about-mission-grid">
        <div><p class="site-eyebrow">我们的工作方式</p><h2>先做出一个能运行的版本，<br />再一起把它做好。</h2><ul class="mission-list"><li v-for="item in about.mission" :key="item">{{ item }}</li></ul></div>
        <div class="about-values"><div v-for="(item, index) in about.values" :key="item"><span>0{{ index + 1 }}</span><strong>{{ item }}</strong></div></div>
      </div>
    </section>

    <section class="site-container about-records">
      <div class="section-kicker"><span>02</span><span>实践记录</span></div>
      <div class="records-grid"><article v-for="item in about.achievements" :key="item"><span class="record-line"></span><p>{{ item }}</p></article></div>
      <div class="about-advisor"><div><p class="site-eyebrow">指导与支持</p><h2>在项目里找到自己的责任边界。</h2></div><div><p v-for="advisor in about.advisors" :key="advisor.name"><strong>{{ advisor.name }}</strong><br />{{ advisor.role }}</p><router-link class="text-link" to="/portal?mode=apply">了解加入方式 <span aria-hidden="true">↗</span></router-link></div></div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSiteStore } from '../stores/site'

const siteStore = useSiteStore()
const fallback = {
  hero: { title: '把学习变成一段真实的工程经历。', subtitle: '围绕智能车辆、车载嵌入式、机器视觉与仿真交互，做能被验证、被复用、被展示的学生项目。', image: '/projects/xiaoxueqi-2026/photos/硬件2.JPG', imageAlt: '实验室智能小车项目硬件与电路调试' },
  story: [],
  mission: [],
  values: ['务实实践', '技术融合', '创新探索', '协同共进'],
  advisors: [],
  achievements: [],
}
const about = computed(() => ({ ...fallback, ...(siteStore.data?.about ?? {}), hero: { ...fallback.hero, ...(siteStore.data?.about?.hero ?? {}) } }))
</script>
