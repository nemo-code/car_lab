<template>
  <div class="lab-file-picker">
    <label>上传附件（每个不超过 20 MB，最多 10 个）
      <input type="file" multiple :accept="accept" :disabled="disabled || uploading" @change="choose" />
    </label>
    <small>支持 PNG/JPG/GIF/WebP、PDF、Word、PPT、Excel、TXT、Markdown、CSV、ZIP、MP4/WebM。</small>
    <p v-if="uploading" role="status">正在上传附件，请稍候…</p>
    <p v-if="error" class="lab-error" role="alert">{{ error }}</p>
    <ul class="lab-file-list"><li v-for="file in modelValue" :key="file.id">{{ file.name }} · {{ (file.size / 1024 / 1024).toFixed(2) }} MB <button type="button" class="lab-outline" :disabled="disabled || uploading" @click="remove(file)">移除</button></li></ul>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { uploadFile, discardFile } from '../api/platform'
const props = defineProps({ modelValue: { type: Array, default: () => [] }, purpose: { type: String, required: true }, disabled: Boolean })
const emit = defineEmits(['update:modelValue', 'uploading'])
const uploading = ref(false), error = ref('')
const accept = '.png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv,.zip,.mp4,.webm'
async function remove(file) {
  uploading.value = true; emit('uploading', true); error.value = ''
  try { await discardFile(file.id); emit('update:modelValue', props.modelValue.filter(f => f.id !== file.id)) }
  catch(e) { error.value = e.message }
  finally { uploading.value = false; emit('uploading', false) }
}
async function choose(event) {
  error.value = ''
  const files = [...event.target.files]
  if (files.length + props.modelValue.length > 10) { error.value = '每次最多 10 个附件'; event.target.value = ''; return }
  if (files.some(f => !f.size || f.size > 20 * 1024 * 1024)) { error.value = '不能上传空文件，单个文件最大 20 MB'; event.target.value = ''; return }
  uploading.value = true; emit('uploading', true)
  const selected = [...props.modelValue]
  try {
    for (const file of files) { selected.push((await uploadFile(file, props.purpose)).data); emit('update:modelValue', [...selected]) }
  } catch (e) { error.value = e.message }
  finally { uploading.value = false; emit('uploading', false); event.target.value = '' }
}
</script>
