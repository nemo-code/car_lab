<template>
  <main class="contact-page">
    <section class="hero">
      <SectionTitle :title="contact.hero.title" :subtitle="contact.hero.subtitle" />
    </section>

    <section class="layout">
      <article class="panel">
        <h2>Contact Channels</h2>
        <ul class="channel-list">
          <li v-for="item in contact.channels" :key="item.label">
            <strong>{{ item.label }}:</strong> {{ item.value }}
          </li>
        </ul>
        <p class="note">{{ contact.note }}</p>
      </article>

      <form class="panel form" @submit.prevent="sendRecruitment">
        <h2>Recruitment Intent</h2>
        <input v-model="form.teamName" placeholder="Team name" />
        <input v-model="form.contact" placeholder="Contact info" />
        <select v-model="form.intent">
          <option value="是">是</option>
          <option value="否">否</option>
        </select>
        <textarea v-model="form.note" placeholder="Message"></textarea>
        <Button variant="primary" nativeType="submit">Submit</Button>
      </form>
    </section>
  </main>
</template>

<script setup>
import { computed, reactive } from 'vue'
import Button from '../components/Button.vue'
import SectionTitle from '../components/SectionTitle.vue'
import { submitRecruitment } from '../api/site'
import { useSiteStore } from '../stores/site'

const siteStore = useSiteStore()

const fallback = {
  hero: {
    title: 'Contact',
    subtitle: 'Leave a message or submit a recruitment intent directly from the site.',
  },
  channels: [],
  note: '',
}

const contact = computed(() => siteStore.data?.contact ?? fallback)
const brand = computed(() => siteStore.data?.brand ?? { name: 'combinilen Hub' })

const form = reactive({
  teamName: brand.value.name,
  contact: '',
  intent: '是',
  note: '',
})

async function sendRecruitment() {
  if (!form.contact || !form.note) {
    window.alert('Please fill in contact info and message.')
    return
  }

  await submitRecruitment({
    teamName: form.teamName || brand.value.name,
    intent: form.intent,
    contact: form.contact,
    note: form.note,
  })

  form.contact = ''
  form.note = ''
  form.intent = '是'
  window.alert('Recruitment response sent.')
}
</script>

<style scoped>
.contact-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 24px 48px;
}

.hero {
  margin-bottom: 8px;
}

.layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
}

.panel h2 {
  font-size: 1.2rem;
  margin-bottom: 16px;
  color: #111827;
}

.channel-list {
  list-style: none;
  padding: 0;
  display: grid;
  gap: 10px;
  color: #4b5563;
}

.note {
  margin-top: 18px;
  color: #6b7280;
}

.form {
  display: grid;
  gap: 12px;
}

.form input,
.form select,
.form textarea {
  width: 100%;
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  padding: 12px;
  background: #f8fafc;
  color: #111827;
}

.form textarea {
  min-height: 120px;
  resize: vertical;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
