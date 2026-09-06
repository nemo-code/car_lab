<template>
  <div id="app-layout">
    <NavBar />

    <main class="main-content">
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

const siteStore = useSiteStore()

onMounted(() => {
  siteStore.loadSite().catch(() => {})
})
</script>

<style>
#app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.main-content {
  padding-top: 80px;
  flex: 1;
  background: #f8fafc;
}
</style>
