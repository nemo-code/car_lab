<template>
  <div class="lab-home">
    <section class="home-hero">
      <img class="home-hero-image" :src="home.hero.image" :alt="home.hero.imageAlt" />
      <div class="home-hero-shade"></div>
      <div class="site-container home-hero-content">
        <p class="site-eyebrow"><span class="status-dot"></span> {{ home.hero.eyebrow }}</p>
        <h1>{{ home.hero.title }}</h1>
        <p class="home-hero-copy">{{ home.hero.subtitle }}</p>
        <div class="home-actions">
          <router-link class="action-button action-light" to="/projects">看正在做的项目 <span aria-hidden="true">↗</span></router-link>
          <router-link class="action-text" to="/portal?mode=apply">加入实验室 <span aria-hidden="true">→</span></router-link>
        </div>
        <div class="home-hero-index"><span>{{ home.hero.indexLabel }}</span><span>01 — 03</span></div>
      </div>
      <a class="hero-scroll" href="#directions"><span></span> 向下探索</a>
    </section>

    <section class="site-container home-intro" id="directions">
      <div class="section-kicker"><span>01</span><span>{{ home.intro.eyebrow }}</span></div>
      <div class="home-intro-heading">
        <h2>{{ home.intro.title }}</h2>
        <p>{{ home.intro.subtitle }}</p>
      </div>
      <div class="direction-list">
        <router-link v-for="(team, index) in teams" :key="team.id" class="direction-row" :to="`/teams/${team.id}`">
          <span class="direction-index">0{{ index + 1 }}</span>
          <div class="direction-main"><span>{{ team.caption }}</span><h3>{{ team.name }}</h3><p>{{ team.intro }}</p></div>
          <img :src="team.image" :alt="`${team.name}项目实践`" />
          <span class="direction-arrow" aria-hidden="true">↗</span>
        </router-link>
      </div>
    </section>

    <section class="home-showcase">
      <div class="site-container showcase-inner">
        <div class="section-kicker section-kicker-light"><span>02</span><span>{{ home.showcase.eyebrow }}</span></div>
        <div class="showcase-copy"><h2>{{ home.showcase.title }}</h2><p>{{ home.showcase.subtitle }}</p><a class="action-button action-outline-light" :href="home.showcase.href">{{ home.showcase.ctaLabel }} <span aria-hidden="true">↗</span></a></div>
        <div class="showcase-photos">
          <figure v-for="photo in home.showcase.photos" :key="photo.src"><img :src="photo.src" :alt="photo.alt" /><figcaption>{{ photo.caption }}</figcaption></figure>
        </div>
      </div>
    </section>

    <section class="site-container home-join">
      <div class="section-kicker"><span>03</span><span>{{ home.join.eyebrow }}</span></div>
      <div class="join-content"><div><h2>{{ home.join.title }}</h2><p>{{ home.join.subtitle }}</p></div><div class="join-steps"><div v-for="(step, index) in home.join.steps" :key="step"><span>0{{ index + 1 }}</span><p>{{ step }}</p></div></div><router-link class="action-button action-dark" :to="home.join.href">{{ home.join.ctaLabel }} <span aria-hidden="true">↗</span></router-link></div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useTeamsStore } from '../stores/teams'
import { useSiteStore } from '../stores/site'

const teamsStore = useTeamsStore()
const siteStore = useSiteStore()
const teams = computed(() => teamsStore.publicData)
const fallback = {
  hero: {
    eyebrow: '成都东软学院 · 智能网联汽车实验室',
    title: '下一台车，等你来造。',
    subtitle: '从一根线、一行代码、一张界面开始，把想法做成能跑、能玩、能展示的作品。',
    indexLabel: '实验室 / 2026',
    image: '/projects/xiaoxueqi-2026/photos/硬件2.JPG',
    imageAlt: '学生搭建并调试智能小车硬件',
  },
  intro: {
    eyebrow: '研究方向',
    title: '把课堂知识，接到真实项目上。',
    subtitle: '实验室以项目为线索，把软件、硬件与仿真连接起来。你可以从熟悉的部分开始，也可以在协作中逐步拓展边界。',
  },
  showcase: {
    eyebrow: '小学期成果展',
    title: '真实的作品，比概念更有说服力。',
    subtitle: '循迹小车、车载辅助系统、多人驾驶仿真。浏览学生团队的阶段成果、技术路线与现场实践。',
    ctaLabel: '进入成果展',
    href: '/projects/xiaoxueqi-2026/showcase-site/index.html',
    photos: [
      { src: '/projects/xiaoxueqi-2026/photos/硬件3.JPG', alt: '智能小车硬件制作与调试', caption: '硬件实物 / 传感与控制' },
      { src: '/projects/xiaoxueqi-2026/photos/游戏1.png', alt: '学生体验驾驶仿真项目', caption: '仿真交互 / 驾驶体验' },
    ],
  },
  join: {
    eyebrow: '加入方式',
    title: '先找到好奇的方向，再一起把它做出来。',
    subtitle: '不要求你入门前就掌握全部技术。了解团队、提交申请，审核通过后即可进入所属团队的资源空间。',
    steps: ['浏览项目与团队方向', '提交学号和加入申请', '登录查看审核进度'],
    ctaLabel: '开始申请',
    href: '/portal?mode=apply',
  },
}
const home = computed(() => {
  const content = siteStore.data?.home ?? {}
  return {
    ...fallback,
    ...content,
    hero: { ...fallback.hero, ...(content.hero ?? {}) },
    intro: { ...fallback.intro, ...(content.intro ?? {}) },
    showcase: { ...fallback.showcase, ...(content.showcase ?? {}) },
    join: {
      ...fallback.join,
      ...(content.join ?? {}),
      steps: Array.isArray(content.join?.steps) && content.join.steps.length ? content.join.steps : fallback.join.steps,
    },
  }
})
onMounted(() => { teamsStore.loadTeams() })
</script>
