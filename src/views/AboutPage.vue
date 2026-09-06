<template>
  <main class="about-page">
    <section class="hero">
      <div class="title-box">
        <h1 class="hero-title">{{ about.hero.title }}</h1>
      </div>
      <div class="hero-image" aria-label="实验室图片轮播">
        <div class="flip-gallery">
          <img class="flip-image flip-image-one" src="/picture1.png" alt="智能网联汽车实验室" />
          <img class="flip-image flip-image-two" src="/picure2.jpg" alt="实验室项目展示" />
          <img class="flip-image flip-image-three" src="/picure3.jpg" alt="实验室设备展示" />
        </div>
      </div>
    </section>

    <section class="main-content">
      <div class="two-columns">
        <div class="left-columns">
          <section class="card">
            <h2>OUR STORY:</h2>
            <h3>Leading Student Innovation</h3>
            <div class="card-content">
              <p v-for="item in about.story" :key="item">{{ item }}</p>
            </div>
          </section>

          <section class="card mission-card">
            <h2>OUR MISSION:</h2>
            <h3>Developing Futures</h3>
            <div class="mission-layout">
              <div class="card-content">
                <p v-for="item in about.mission" :key="item">{{ item }}</p>
              </div>
              <img class="mission-image" src="/picture4.png" alt="智能网联汽车实验室项目" />
            </div>
          </section>

          <section class="card">
            <h2>Our Values:</h2>
            <div class="values-layout">
              <div class="list">
                <ui class="items">
                  <li v-for="item in about.values" :key="item">{{ item }}</li>
                </ui>
              </div>
              <img class="values-image" src="/picture5.png" alt="智能网联汽车实验室价值理念" />
            </div>
          </section>
        </div>

        <div class="right-columns">
          <div class="right-card">
            <h2>OUR ADVISGRS</h2>
            <div class="team-list">
              <div v-for="advisor in about.advisors" :key="advisor.name" class="team-card">
                {{ advisor.name }}
              </div>
            </div>
          </div>

          <div class="right-card2">
            <h2>OUR ACHIEVEMENTS</h2>
            <div class="achievement-content">
              <ul>
                <li v-for="item in about.achievements" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
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
    title: 'MEET THE COMBINILEN VISIONARIES',
  },
  story: [],
  mission: [],
  values: [],
  advisors: [],
  achievements: [],
}

const about = computed(() => siteStore.data?.about ?? fallback)
</script>

<style scoped>
.about-page {
  width: 1350px;
  width: 90%;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
  background: #f5f6fa;
}
.hero{
    text-align: center;
    height: 500px;
    padding: 40px 0;
    border-radius: 24px;
    background: linear-gradient(120deg, #a8edea, #fed6e3, #9face6);
}
.hero-title {
  font-size: 48px;
  line-height: 1.15;
  margin: 0;
  color: #111827;
  letter-spacing: 1px;
  text-align: left;
  padding-top: 60px;
  padding-left: 50px;
}
.hero-image {
  height: 330px;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1000px;
}
.flip-gallery {
  position: relative;
  width: min(720px, 90%);
  height: 290px;
  transform-style: preserve-3d;
}
.flip-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 18px;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
  backface-visibility: hidden;
  animation: image-flip 9s infinite ease-in-out;
}
.flip-image-two {
  animation-delay: -3s;
}
.flip-image-three {
  animation-delay: -6s;
}
@keyframes image-flip {
  0%, 27% {
    opacity: 1;
    transform: rotateY(0deg);
    z-index: 2;
  }
  33%, 94% {
    opacity: 0;
    transform: rotateY(180deg);
    z-index: 1;
  }
  100% {
    opacity: 1;
    transform: rotateY(360deg);
    z-index: 2;
  }
}
.main-content{
    width: 1350px;
    width: 100%;
    margin: 20px 0;
    padding: 0;
}
.two-columns{
    display: flex;
    gap: 30px;
    align-items: stretch;
}
.left-columns{
    flex: 1.3;
    background-color: #f5f6fa;
    display: flex;
    flex-direction: column;
    gap: 20px;
    border-radius: 22px;
}
.right-columns{
    flex: 0.7;
    background-color: #caddef;
    height: 900px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    border-radius: 22px;
}
.card {
  background: #ffffff;
  padding: 24px;
  border-radius: 20px;
  margin-bottom: 24px;
}

.card h2 {
  font-size: 48px;
  line-height: 1.15;
  margin-bottom: 0;
  color: #111827;
  letter-spacing: 1px;
  text-align: left;
  padding-top: 20px;
  padding-bottom: 10px;
  padding-left: 50px;
  margin-top: -10px;
}

.card h3 {
  font-size: 38px;
  line-height: 1.15;
  margin: 0 12px;
  margin-top: 0;
  margin-bottom: 0;
  color: #111827;
  letter-spacing: 1px;
  text-align: left;
  padding-left: 50px;
}

.card_content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mission-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: center;
}

.mission-image {
  width: 100%;
  height: 240px;
  object-fit: contain;
  border-radius: 14px;
  display: block;
  background: #f3f4f6;
}

.values-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: center;
}

.values-image {
  width: 100%;
  height: 220px;
  object-fit: contain;
  border-radius: 14px;
  display: block;
  background: #f3f4f6;
}

.card p{
  height: 40px;
  border-radius: 8px;
}
.list{
  padding-left: 55px;
}
.list li{
  height: 40px;
  border-radius: 6px;
}
.right-card,
.right-card2{
    padding: 20px;
    background-color: #f6f9fc;
    border-radius: 16px;
    margin: 16px;
    width: 80%;
    margin-left: auto;
    margin-right: auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.right-card h2,
.right-card2 h2{
    font-size: 36px;
    margin-top: 5px;
    margin-bottom: 16px;
    color: #111827;
}
.team-list{
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.team-card{
  height: 80px;
  border-radius: 16px;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
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
.achievement-content li{
    height: 60px;
}

@media (max-width: 700px) {
  .mission-layout,
  .values-layout {
    grid-template-columns: 1fr;
  }

  .mission-image,
  .values-image {
    height: 200px;
  }
}

</style>
