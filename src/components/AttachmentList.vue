<template>
  <div v-if="files?.length" class="lab-attachments" aria-label="附件列表">
    <article v-for="file in files" :key="file.id || file.url" class="lab-attachment">
      <img v-if="['image/png','image/jpeg','image/gif','image/webp'].includes(file.mime)" :src="file.url" :alt="file.name" loading="lazy" />
      <video v-else-if="file.mime?.startsWith('video/') && !file.id" :src="file.url" controls preload="metadata" />
      <a :href="file.url" target="_blank" rel="noopener">{{ file.name }}{{ file.size ? ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : '' }} ↗</a>
    </article>
  </div>
</template>
<script setup>
defineProps({ files: Array })
</script>
