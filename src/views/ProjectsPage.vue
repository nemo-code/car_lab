<template>
  <main class="projects-page">
    <section class="hero">
      <SectionTitle :title="projects.hero.title" :subtitle="projects.hero.subtitle" />
    </section>

    <section class="project-grid">
      <article v-for="project in projects.items" :key="project.name" class="project-card">
        <p class="category">{{ project.category }}</p>
        <h2>{{ project.name }}</h2>
        <p class="summary">{{ project.summary }}</p>
        <div class="stack-list">
          <span v-for="item in project.stack" :key="item" class="stack-pill">{{ item }}</span>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import SectionTitle from '../components/SectionTitle.vue'
import { useSiteStore } from '../stores/site'

const siteStore = useSiteStore()

const fallback = {
  hero: {
    title: 'Selected Projects',
    subtitle: 'A small set of work samples that show the team\'s range and delivery style.',
  },
  items: [],
}

const projects = computed(() => siteStore.data?.projects ?? fallback)
</script>

<style scoped>
.projects-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px 48px;
}

.hero {
  margin-bottom: 8px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.project-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
}

.category {
  color: #2563eb;
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.project-card h2 {
  font-size: 1.2rem;
  margin-bottom: 8px;
  color: #111827;
}

.summary {
  color: #6b7280;
}

.stack-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.stack-pill {
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef2ff;
  color: #1d4ed8;
}

@media (max-width: 900px) {
  .project-grid {
    grid-template-columns: 1fr;
  }
}
</style>
