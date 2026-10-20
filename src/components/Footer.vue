<template>
  <footer class="site-footer">
    <div class="site-container">
      <div class="footer-main">
        <div class="footer-identity">
          <router-link to="/" class="footer-brand">{{ brand.name }}</router-link>
          <p>把想法做成能运行、能验证、能分享的智能车辆项目。</p>
          <span>{{ brand.address }}</span>
        </div>
        <nav class="footer-links" aria-label="页脚导航">
          <span>探索实验室</span>
          <router-link v-for="link in footerLinks" :key="`${link.path}-${link.label}`" :to="link.path">
            {{ link.label }} <span aria-hidden="true">↗</span>
          </router-link>
        </nav>
        <div class="footer-join">
          <span>想一起做点真实的东西？</span>
          <router-link to="/portal?mode=apply">了解加入方式 <span aria-hidden="true">→</span></router-link>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© {{ new Date().getFullYear() }} {{ brand.name }}</span>
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">蜀ICP备2026057846号-1</a>
        <span>学习 · 实践 · 协作</span>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'
import { useSiteStore } from '../stores/site'

const store = useSiteStore()
const brand = computed(() => store.data?.brand ?? {
  name: '智能网联汽车实验室',
  address: '成都东软学院 · 智能网联汽车实验室',
})
const footerLinks = computed(() => store.data?.footer?.links ?? [
  { label: '实验室介绍', path: '/about' },
  { label: '项目成果', path: '/projects' },
  { label: '资源库', path: '/resources' },
])
</script>
