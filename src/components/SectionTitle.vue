<template>
  <div class="section-title">
    <span v-if="subtitle" class="subtitle">{{ subtitle }}</span>
    <h2 class="title">{{ title }}</h2>
    <div v-if="showDivider" class="divider"></div>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  showDivider: {
    type: Boolean,
    default: true,
  },
})
</script>

<style scoped>
.section-title {
  text-align: center;
  margin-bottom: 3rem;
  position: relative;
}

.subtitle {
  display: inline-block;
  font-size: 0.9rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: #6366f1;
  margin-bottom: 0.8rem;
}

.title {
  font-size: 2.2rem;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  line-height: 1.3;
}

.divider {
  width: 60px;
  height: 4px;
  background: linear-gradient(90deg, #6366f1, #a855f7);
  margin: 1rem auto 0;
  border-radius: 2px;
}
</style>
