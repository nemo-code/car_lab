<template>
  <nav class="nav-container">
    <div class="nav-glass">
      <router-link
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        active-class="active"
      >
        {{ item.label }}
      </router-link>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useSiteStore } from '../stores/site'

const store = useSiteStore()

const menuItems = computed(() => store.data?.navigation ?? [
  { path: '/', label: 'Home' },
  { path: '/about', label: 'About Us' },
  { path: '/projects', label: 'Projects' },
  { path: '/resources', label: '资源库' },
  { path: '/services', label: 'Services' },
  { path: '/team', label: 'Team' },
  { path: '/contact', label: 'Contact' },
])
</script>

<style scoped>
.nav-container {
  width: 100%;
  display: flex;
  justify-content: center;
  padding: 20px 0;
  position: fixed;
  top: 0;
  z-index: 1000;
}

.nav-glass {
  display: flex;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(10px);
  border-radius: 40px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.nav-item {
  text-decoration: none;
  padding: 10px 22px;
  color: #333;
  transition: 0.3s;
  border-radius: 30px;
}

.active {
  background: linear-gradient(135deg, #a5f3fc 0%, #dcfce7 100%);
  font-weight: bold;
}
</style>
