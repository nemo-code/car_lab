<template>
  <header class="lab-nav"><div class="lab-wrap lab-nav-inner"><router-link class="lab-brand" to="/">智能网联汽车实验室</router-link><nav aria-label="主导航" :class="{ open: expanded }"><router-link to="/" @click="expanded = false">首页</router-link><router-link to="/teams/software" @click="expanded = false">软件</router-link><router-link to="/teams/hardware" @click="expanded = false">硬件</router-link><router-link to="/teams/simulation" @click="expanded = false">游戏 / 仿真</router-link><router-link to="/resources" @click="expanded = false">资源库</router-link><router-link to="/projects" @click="expanded = false">项目</router-link><router-link class="lab-nav-login" to="/portal" @click="expanded = false">成员入口</router-link></nav><button type="button" class="lab-menu" :aria-expanded="expanded" aria-label="切换导航菜单" @click="expanded = !expanded">☰</button></div></header>
</template>
<script setup>
import { ref } from 'vue'
const expanded = ref(false)
</script>
