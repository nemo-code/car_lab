<template>
  <main class="home-page">
    <section class="top-layout">
      <div class="hero">
        <div class="hero-content">
          <h1>{{ home.hero.title }}</h1>
          <p>{{ home.hero.subtitle }}</p>
        </div>

        <div class="hero-image">
          <img :src="home.hero.image" :alt="home.hero.imageAlt" />
        </div>
      </div>

      <aside class="side-panel">
        <section class="side-card">
          <h2>Featured Projects</h2>

          <div class="mini-project-list">
            <div
              v-for="project in featuredProjects"
              :key="project.name"
              class="mini-project-card"
            >
              <h3>{{ project.name }}</h3>
              <span class="mini-project-category">{{ project.category }}</span>
              <p>{{ project.summary }}</p>
            </div>
          </div>
        </section>

        <section class="side-card">
          <h2>Meet the Team</h2>

          <div class="team-list">
            <div v-for="member in teamHighlights" :key="member.name" class="team-card">
              <div class="avatar">{{ member.name.slice(0, 1) }}</div>
              <p>{{ member.name }}</p>
            </div>
          </div>
        </section>
      </aside>
    </section>

    <section class="services">
      <h2>Services</h2>

      <div class="service-list">
        <div v-for="(service, index) in serviceCards" :key="service.title" class="service-card">
          <div class="service-icon">{{ String(index + 1).padStart(2, '0') }}</div>
          <h3>{{ service.title }}</h3>
          <p>{{ service.summary }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { useSiteStore } from '../stores/site'

const siteStore = useSiteStore()

const fallback = {
  hero: {
    title: '智能网联汽车实验室',
    subtitle: '本实验室面向新工科人才培养，围绕智能汽车、车路协同、车载嵌入式、机器视觉感知开展教学与科研工作，服务物联网工程、车辆工程等专业。实验室配备鸿蒙智驾小车、视觉采集套件、仿真工作站等实训设备，承接小学期综合实训、课程设计、大创项目以及各类学科竞赛任务。实现硬件开发、软件编程、算法调测一体化实践，学生可完成智能小车控制、传感器采集、上下位机联动、图像识别等完整项目开发，产出实训作品、软件著作权与竞赛成果，重点开展车载嵌入式小车控制、机器视觉环境感知、车路协同通信、仿真算法验证等方向的实践研究。',
    image: '/picture1.png',
    imageAlt: 'Hero 图片区域',
  },
  featuredProjects: [],
  teamHighlights: [],
  services: [],
}

const home = computed(() => siteStore.data?.home ?? fallback)
const featuredProjects = computed(() => home.value.featuredProjects ?? [])
const teamHighlights = computed(() => home.value.teamHighlights ?? [])
const serviceCards = computed(() => home.value.services ?? [])
</script>

<style scoped>
.home-page {
  width: 100%;
  min-height: 100vh;
  padding: 40px 80px;
  box-sizing: border-box;
  background: #f5f6fa;
}


.top-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 32px;
  align-items: stretch;
}


.hero {
  min-height: 520px;
  padding: 48px;
  border-radius: 28px;
  background: linear-gradient(120deg, #a8edea, #fed6e3, #9face6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
}

.hero-content {
  flex: 1.3;
}

.hero-content h1 {
  font-size: 48px;
  line-height: 1.15;
  margin: 0 0 24px;
  color: #111827;
  letter-spacing: 1px;
}

.hero-content p {
  font-size: 20px;
  line-height: 1.6;
  color: #374151;
}

.hero-image {
  flex: 1;
  height: 280px;
  border-radius: 24px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.35);
}

.hero-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 鍙充晶 */
.side-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.side-card {
  flex: 1;
  padding: 24px;
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
}

.side-card h2 {
  margin: 0 0 16px;
  font-size: 24px;
  color: #111827;
}

.mini-project-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.mini-project-card {
  padding: 16px;
  border-radius: 16px;
  background: #eef2ff;
  cursor: pointer;
  transition: all 0.3s ease;
}

.mini-project-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
  color: #111827;
}

.mini-project-category {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #6366f1;
}

.mini-project-card p {
  margin: 0;
  font-size: 14px;
  color: #4b5563;
}


.mini-project-card:hover {
  transform: translateY(-8px) scale(1.03);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.14);
  background: #dbeafe;
}

/* Team */
.team-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.team-card {
  height: 110px;
  border-radius: 16px;
  background: #f3f4f6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #111827;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.team-card p {
  margin: 0;
  font-size: 14px;
  color: #374151;
}


.team-card:hover {
  transform: translateY(-8px) scale(1.05);
  background: #e0f2fe;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.14);
}

.team-card:hover .avatar {
  transform: rotate(8deg) scale(1.1);
  transition: all 0.3s ease;
}

/* Services */
.services {
  margin-top: 40px;
  padding: 40px;
  border-radius: 28px;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
}

.services h2 {
  margin: 0 0 24px;
  font-size: 32px;
  color: #111827;
}


.service-list {
  display: flex;
  gap: 28px;
}

.service-card {
  width: 180px;
  height: 180px;
  border-radius: 24px;
  background: #f9fafb;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.35s ease;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05);
}

.service-icon {
  font-size: 36px;
  transition: all 0.35s ease;
}

.service-card h3 {
  margin: 0;
  font-size: 18px;
  color: #111827;
}

.service-card p {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}


.service-card:hover {
  transform: translateY(-12px) rotate(1deg) scale(1.06);
  background: linear-gradient(135deg, #dbeafe, #fce7f3);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.16);
}

.service-card:hover .service-icon {
  transform: scale(1.25) rotate(-8deg);
}


@media (max-width: 1000px) {
  .home-page {
    padding: 24px;
  }

  .top-layout {
    grid-template-columns: 1fr;
  }

  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-content h1 {
    font-size: 36px;
  }

  .service-list {
    flex-wrap: wrap;
  }

  .service-card {
    width: 100%;
  }
}
</style>
