<template>
  <main class="page">
    <section class="hero">
      <div class="hero-left">
        <h1>{{ services.hero.title }}<br />{{ services.hero.subtitle }}</h1>
      </div>

      <div class="hero-visual">
        <img src="/picture6.png" alt="智能车辆实践展示" />
      </div>
      <div class="hero-visual">
        <img src="/picture7.png" alt="大模型应用展示" />
      </div>
    </section>

    <section class="content">
      <div class="main">
        <section class="card">
          <h2>{{ services.hero.title }}</h2>

          <div class="services">
            <div v-for="specialty in services.specialties" :key="specialty.title" class="service">
              <h3>{{ specialty.title }}</h3>
              <p>{{ specialty.summary }}</p>
            </div>
          </div>
        </section>

        <section class="card ai">
          <h2>{{ services.largeModel.title }}</h2>
          <p class="ai-subtitle">{{ services.largeModel.subtitle }}</p>
          <p class="ai-intro">{{ services.largeModel.intro }}</p>

          <div class="ai-items">
            <article v-for="item in services.largeModel.items" :key="item.title" class="ai-item">
              <h3>{{ item.title }}</h3>
              <p>{{ item.summary }}</p>
            </article>
          </div>

          <div class="learning-outcome">
            <h3>学习成果</h3>
            <ul>
              <li v-for="outcome in services.largeModel.learningOutcome" :key="outcome">
                {{ outcome }}
              </li>
            </ul>
          </div>
        </section>

        <section class="card">
          <h2>SERVICE PROCESS</h2>

          <div class="process">
            <div v-for="step in services.process" :key="step" class="step">{{ step }}</div>
          </div>
        </section>
      </div>

      <aside class="sidebar">
        <div class="card">
          <h3>CLIENT TESTIMONIALS</h3>
          <div v-for="item in services.testimonials" :key="item" class="testimonial">
            “{{ item }}”
          </div>
        </div>

        <form class="card" @submit.prevent="sendQuote">
          <h3>GET A QUOTE</h3>
          <input v-model="quote.name" placeholder="Name" />
          <input v-model="quote.email" placeholder="Email" />
          <textarea v-model="quote.message" placeholder="Message"></textarea>
          <button type="submit">GET QUOTE</button>
        </form>
      </aside>
    </section>

  </main>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { submitContact } from '../api/site'
import { useSiteStore } from '../stores/site'

const siteStore = useSiteStore()

const fallback = {
  hero: {
    title: 'OUR CORE SPECIALTIES:',
    subtitle: 'Build Your Ideas',
  },
  specialties: [],
  largeModel: {
    title: 'LARGE MODEL APPLICATIONS',
    subtitle: '大模型与智能车载融合实践',
    intro: '探索大模型在智能车辆场景下的落地，结合机器视觉、嵌入式硬件完成AI原型开发，参与真实AI应用项目。',
    items: [],
    learningOutcome: [],
  },
  process: [],
  testimonials: [],
}

const services = computed(() => {
  const remoteServices = siteStore.data?.services ?? {}

  return {
    ...fallback,
    ...remoteServices,
    largeModel: {
      ...fallback.largeModel,
      ...(remoteServices.largeModel ?? {}),
    },
  }
})
const brand = computed(() => siteStore.data?.brand ?? {
  name: 'combinilen Hub',
  email: 'anvapilot@combinilen.hub',
})

const quote = reactive({
  name: '',
  email: '',
  message: '',
})

async function sendQuote() {
  if (!quote.name || !quote.email || !quote.message) {
    window.alert('Please fill in name, email, and message.')
    return
  }

  await submitContact({
    name: quote.name,
    email: quote.email,
    message: `Quote request: ${quote.message}`,
  })

  quote.name = ''
  quote.email = ''
  quote.message = ''
  window.alert('Quote sent.')
}
</script>

<style scoped>
.page {
  padding: 40px;
  background: #f5f6fa;
}

/* HERO */
.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 80px;
  border-radius: 24px;
  background: linear-gradient(120deg, #a8edea, #fed6e3, #9face6);
  margin-bottom: 32px;
}

.hero-left h1 {
  font-size: 42px;
}

.hero-visual {
  width: 220px;
  height: 180px;
  background: rgba(255,255,255,0.5);
  border-radius: 20px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hero-visual img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

/* 涓讳綋 */
.content {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
}

.card {
  background: #fff;
  padding: 24px;
  border-radius: 20px;
  margin-bottom: 24px;
}

/* services */
.services {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.service {
  background: #f3f4f6;
  padding: 16px;
  border-radius: 16px;
}

/* AI */
.ai-box {
  height: 160px;
  background: #eef2ff;
  border-radius: 16px;
}

.ai-subtitle {
  margin: -12px 0 12px;
  color: #4f46e5;
  font-weight: 600;
}

.ai-intro {
  margin-bottom: 20px;
  line-height: 1.7;
  color: #4b5563;
}

.ai-items {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.ai-item {
  padding: 18px;
  border-radius: 14px;
  background: #eef2ff;
}

.ai-item h3,
.learning-outcome h3 {
  margin: 0 0 8px;
  color: #111827;
}

.ai-item p {
  margin: 0;
  line-height: 1.6;
  color: #4b5563;
}

.learning-outcome {
  margin-top: 20px;
  padding: 18px;
  border-radius: 14px;
  background: #f3f4f6;
}

.learning-outcome ul {
  margin: 0;
  padding-left: 20px;
  color: #374151;
  line-height: 1.8;
}

/* 娴佺▼ */
.process {
  display: flex;
  justify-content: space-between;
}

.step {
  background: #e5e7eb;
  padding: 10px 14px;
  border-radius: 20px;
}

/* sidebar */
.sidebar input,
.sidebar textarea {
  width: 100%;
  margin-bottom: 10px;
  padding: 8px;
}

.sidebar button {
  width: 100%;
  padding: 10px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
}

@media (max-width: 700px) {
  .ai-items {
    grid-template-columns: 1fr;
  }
}
</style>
