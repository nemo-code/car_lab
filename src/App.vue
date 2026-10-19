<template>
  <div id="app-layout">
    <NavBar />

    <main class="site-main">
      <router-view />
    </main>

    <Footer />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import NavBar from './components/NavBar.vue'
import Footer from './components/Footer.vue'
import { useSiteStore } from './stores/site'
import { useTeamsStore } from './stores/teams'
import './lab.css'

const siteStore = useSiteStore()
const teamsStore = useTeamsStore()

onMounted(() => {
  siteStore.loadSite().catch(() => {})
  teamsStore.loadTeams()
})
</script>

<style>
#app-layout { display: flex; flex-direction: column; min-height: 100vh; }
.site-main { padding-top: 76px; flex: 1; background: var(--paper); min-width: 0; }
</style>
