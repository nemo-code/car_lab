<template>
  <div class="team-page">
    <section class="team-hero">
      <div class="hero-content">
        <h1>{{ team.hero.title }}</h1>
      </div>
    </section>

    <div class="team-content-wrapper">
      <div class="team-content">
        <section class="team-members">
          <div v-for="(member, index) in team.members" :key="member.name" class="member-card">
            <div class="avatar">
              <img :src="memberImages[index]" :alt="`${member.name} portrait`" />
            </div>
            <div class="info">
              <h3>{{ member.name }}</h3>
              <p>{{ member.role }}</p>
              <p class="desc">{{ member.bio }}</p>
            </div>
          </div>
        </section>

        <aside class="team-sidebar">
          <div class="sidebar-block">
            <h2>{{ team.join.title }}</h2>
            <div class="join-diagram">
              <p>{{ team.join.summary }}</p>
            </div>
          </div>
          <div class="sidebar-block">
            <h2>TEAM LIFE</h2>
            <div class="life-grid">
              <div v-for="item in team.life" :key="item" class="life-item">
                <span>{{ item }}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSiteStore } from '../stores/site'

const siteStore = useSiteStore()

const memberImages = [
  '/picture8.png',
  '/picture9.png',
  '/picture10.png',
  '/picture11.png',
  '/picture12.png',
  '/picture13.png',
]

const fallback = {
  hero: {
    title: 'THE BRIGHT MINDS OF SUMENG TECHNOLOGY',
  },
  members: [],
  join: {
    title: 'JOIN OUR TEAM',
    summary: '',
  },
  life: [],
}

const team = computed(() => siteStore.data?.team ?? fallback)
</script>

<style scoped>

.team-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}


.team-hero {
  width: 100%;
  padding: 120px 80px;
  background: linear-gradient(90deg, #a5f3fc 0%, #fbcfe8 50%, #d8b4fe 100%);
  border-radius: 24px 24px 0 0;
}

.hero-content {
  max-width: 1400px;
  margin: 0 auto;
}

.hero-content h1 {
  font-size: 40px;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

/* 涓嬫柟鐧借壊涓讳綋鍖?*/
.team-content-wrapper {
  flex: 1;
  background: #ffffff;
  padding: 60px 80px;
}

.team-content {
  max-width: 1400px;
  margin: 0 auto;
  display: flex;
  gap: 50px;
}

/* 鎴愬憳鍗＄墖鍖哄煙 */
.team-members {
  flex: 3;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 40px;
}

.member-card {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.avatar {
  width: 100%;
  height: 200px;
  background: #f1f1f1;
}

.avatar img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}

.info {
  padding: 22px;
}

.info h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
}

.info p {
  font-size: 14px;
  color: #666;
  margin: 0 0 8px;
}

.info .desc {
  font-size: 13px;
  color: #999;
  line-height: 1.5;
}

/* 鍙充晶杈规爮 */
.team-sidebar {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.sidebar-block {
  background: #f8f9fa;
  padding: 24px;
  border-radius: 16px;
}

.sidebar-block h2 {
  font-size: 20px;
  margin: 0 0 16px;
}

.join-diagram {
  width: 100%;
  height: 160px;
  background: #eee;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 12px;
  color: #666;
}

.join-diagram p {
  margin: 0;
  line-height: 1.8;
}

.life-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.life-item {
  width: 100%;
  height: 90px;
  background: #eee;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 10px;
  color: #666;
}

.life-item span {
  line-height: 1.5;
}
</style>

