<template>
  <header class="site-nav" @keydown.esc.prevent="handleEscape">
    <div class="site-nav-inner site-container">
      <router-link class="site-brand" to="/" :aria-label="`${brand.name}首页`" @click="closeMenu">
        <span class="brand-mark" aria-hidden="true">V2X</span>
        <span class="brand-copy"><strong>{{ brand.name }}</strong><small>{{ brand.tagline }}</small></span>
      </router-link>

      <button
        ref="menuToggle"
        class="site-menu-toggle"
        type="button"
        :aria-expanded="expanded"
        aria-controls="site-navigation"
        :aria-label="expanded ? '关闭导航菜单' : '打开导航菜单'"
        @click="expanded = !expanded"
      >
        <span></span><span></span>
      </button>

      <nav id="site-navigation" class="site-navigation" :class="{ 'is-open': expanded }" aria-label="主导航">
        <router-link to="/" exact-active-class="is-active" @click="closeMenu">{{ labelFor('/') }}</router-link>
        <router-link to="/about" active-class="is-active" @click="closeMenu">{{ labelFor('/about', '实验室') }}</router-link>
        <details class="team-nav" :open="teamMenuOpen">
          <summary ref="teamMenuSummary" :class="{ 'is-active': isTeamRoute }" @click.prevent="toggleTeamMenu">{{ labelFor('/teams', labelFor('/team', '研究方向')) }} <span aria-hidden="true">⌄</span></summary>
          <div class="team-nav-panel">
            <router-link v-for="team in teams" :key="team.id" :to="`/teams/${team.id}`" @click="closeMenu">{{ team.name }}</router-link>
          </div>
        </details>
        <router-link to="/projects" active-class="is-active" @click="closeMenu">{{ labelFor('/projects', '项目成果') }}</router-link>
        <router-link to="/announcements" active-class="is-active" @click="closeMenu">{{ labelFor('/announcements', '新闻公告') }}</router-link>
        <router-link to="/resources" active-class="is-active" @click="closeMenu">{{ labelFor('/resources', '资源库') }}</router-link>
        <router-link to="/assignments" active-class="is-active" @click="closeMenu">作业</router-link>
        <router-link class="site-nav-cta" to="/portal?mode=apply" @click="closeMenu">{{ labelFor('/portal', '加入实验室') }} <span aria-hidden="true">↗</span></router-link>
      </nav>
    </div>
  </header>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useTeamsStore } from '../stores/teams'
import { useSiteStore } from '../stores/site'

const route = useRoute()
const teamsStore = useTeamsStore()
const siteStore = useSiteStore()
const teams = computed(() => teamsStore.publicData)
const brand = computed(() => ({
  name: '智能网联汽车实验室',
  tagline: '成都东软学院 · 工程实践与创新',
  ...(siteStore.data?.brand ?? {}),
}))
const navigation = computed(() => Array.isArray(siteStore.data?.navigation) ? siteStore.data.navigation : [])
const expanded = ref(false)
const teamMenuOpen = ref(false)
const menuToggle = ref(null), teamMenuSummary = ref(null)
const isTeamRoute = computed(() => route.path.startsWith('/teams/'))
function labelFor(path, fallback = path) {
  return navigation.value.find(item => item?.path === path)?.label || fallback
}

function closeMenu() {
  expanded.value = false
  teamMenuOpen.value = false
}

function toggleTeamMenu() {
  teamMenuOpen.value = !teamMenuOpen.value
}

function handleEscape() {
  if (expanded.value) {
    closeMenu()
    nextTick(() => menuToggle.value?.focus())
  } else if (teamMenuOpen.value) {
    teamMenuOpen.value = false
    nextTick(() => teamMenuSummary.value?.focus())
  }
}

watch(() => route.path, closeMenu)

onMounted(() => { teamsStore.loadTeams() })
</script>
