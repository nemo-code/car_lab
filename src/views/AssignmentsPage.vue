<template>
  <main class="lab-wrap lab-section">
    <div class="lab-heading"><span class="lab-eyebrow">学习与实践</span><h1>作业与提交</h1><p>查看作业要求，填写说明并上传文档、图片或项目压缩包。截止前可以再次提交，历史记录会保留。</p></div>
    <p v-if="loading" class="lab-notice">正在加载…</p>
    <p v-if="error" class="lab-error" role="alert">{{ error }}</p>
    <p v-if="message" class="lab-notice" role="status">{{ message }}</p>
    <section v-if="!loading && (!user || user.status !== 'approved')" class="lab-panel"><h2>{{ user ? '账号等待审核' : '请先登录' }}</h2><p>学生和老师经管理员审核后即可提交作业。</p><router-link class="lab-primary" to="/portal">进入成员工作台</router-link></section>
    <template v-else-if="!loading && user">
      <section v-if="isStaff" class="lab-panel"><h2>发布作业</h2><form class="lab-form" @submit.prevent="publish">
        <label>作业标题<input v-model.trim="draft.title" maxlength="120" required /></label>
        <label>适用团队<select v-model="draft.team"><option value="all">三个团队</option><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label>
        <label class="lab-span">作业要求<textarea v-model.trim="draft.body" rows="4" maxlength="30000" required /></label>
        <label>截止时间（选填）<input v-model="draft.dueAt" type="datetime-local" /></label><button class="lab-primary" :disabled="busy">发布作业</button>
      </form></section>
      <section class="lab-panel"><h2>可提交的作业</h2><p v-if="!assignments.length" class="lab-empty">暂时没有作业。</p>
        <article v-for="assignment in assignments" :key="assignment.id" class="lab-assignment-card"><span class="lab-eyebrow">{{ assignment.team === 'all' ? '全部团队' : teamName(assignment.team) }} · {{ assignment.author_name }}</span><h3>{{ assignment.title }}</h3><p class="lab-resource-body">{{ assignment.body }}</p><p>{{ assignment.due_at ? '截止：' + formatDate(assignment.due_at) : '未设置截止时间' }}</p><button class="lab-outline" :disabled="busy || uploading || expired(assignment)" @click="select(assignment)">{{ expired(assignment) ? '已截止' : selected?.id === assignment.id ? '正在填写' : '提交作业' }}</button></article>
      </section>
      <section v-if="selected" ref="submissionPanel" class="lab-panel"><h2>提交：{{ selected.title }}</h2><form class="lab-form" @submit.prevent="submit">
        <label class="lab-span">提交说明<textarea v-model.trim="submission.body" rows="5" maxlength="30000" placeholder="填写解题思路、完成情况或文件说明" /></label>
        <div class="lab-span"><FilePicker v-model="submission.attachments" purpose="submission" :disabled="busy" @uploading="uploading = $event" /></div>
        <button class="lab-primary" :disabled="busy || uploading">提交作业</button>
      </form></section>
      <section class="lab-panel"><h2>{{ isStaff ? '作业提交记录（全部成员）' : '我的提交记录' }}</h2><label v-if="isStaff">按团队筛选<select v-model="reviewTeam"><option value="all">所有团队</option><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label><p v-if="!visibleSubmissions.length" class="lab-empty">暂无提交记录。</p>
        <article v-for="entry in visibleSubmissions" :key="entry.id" class="lab-assignment-card"><h3>{{ entry.assignment_title }}</h3><p>{{ entry.author_name }} · {{ entry.author_role === 'teacher' ? '老师' : teamName(entry.team) }} · {{ entry.student_id || '' }} · {{ formatDate(entry.created_at) }}</p><p class="lab-resource-body">{{ entry.body }}</p><AttachmentList :files="entry.attachments" /></article>
      </section>
    </template>
  </main>
</template>
<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import * as api from '../api/platform'
import { teams, teamName } from '../lab'
import FilePicker from '../components/FilePicker.vue'
import AttachmentList from '../components/AttachmentList.vue'
const user = ref(null), assignments = ref([]), submissions = ref([]), selected = ref(null), reviewTeam = ref('all')
const loading = ref(true), busy = ref(false), uploading = ref(false), error = ref(''), message = ref(''), submissionPanel = ref(null)
const isStaff = computed(() => ['admin','teacher'].includes(user.value?.role))
const visibleSubmissions = computed(() => submissions.value.filter(s => reviewTeam.value === 'all' || s.team === reviewTeam.value))
const draft = reactive({ title: '', body: '', team: 'all', dueAt: '' })
const drafts = reactive({})
const submission = computed(() => selected.value ? drafts[selected.value.id] : { body: '', attachments: [] })
const formatDate = value => new Date(value).toLocaleString('zh-CN')
const expired = a => a.due_at && Date.parse(a.due_at) < Date.now()
async function reload() { assignments.value = (await api.listAssignments()).data; submissions.value = (await api.listSubmissions()).data }
onMounted(async () => { try { user.value = (await api.getMe()).data; if (user.value?.status === 'approved') await reload() } catch(e) { error.value = e.message } finally { loading.value = false } })
async function run(action) { busy.value = true; error.value = ''; message.value = ''; try { await action() } catch(e) { error.value = e.message } finally { busy.value = false } }
function publish() { run(async () => { await api.createAssignment({ ...draft, dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null }); draft.title = ''; draft.body = ''; draft.dueAt = ''; await reload(); message.value = '作业已发布。' }) }
async function select(assignment) { if (!drafts[assignment.id]) drafts[assignment.id] = { body: '', attachments: [] }; selected.value = assignment; await nextTick(); submissionPanel.value?.scrollIntoView({ behavior: 'smooth' }) }
function submit() { if (uploading.value) return; run(async () => { await api.submitAssignment(selected.value.id, { body: submission.value.body, attachments: submission.value.attachments.map(f => f.id) }); delete drafts[selected.value.id]; selected.value = null; await reload(); message.value = '作业已提交，记录已保存。' }) }
</script>
