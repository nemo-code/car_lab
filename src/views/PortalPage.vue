<template>
  <div class="lab-wrap lab-portal lab-section">
    <div class="lab-heading"><span class="lab-eyebrow">实验室成员</span><h1>{{ user ? '成员工作台' : '加入实验室' }}</h1><p>申请加入团队，查看审核进度和你有权访问的资料。</p></div>
    <p v-if="message" class="lab-notice" role="status">{{ message }}</p>
    <p v-if="error" class="lab-error" role="alert">{{ error }}</p>
    <div v-if="loading" class="lab-notice">正在加载…</div>
    <template v-else-if="!user">
      <div class="lab-switch" role="tablist" aria-label="登录或申请"><button type="button" role="tab" :aria-selected="mode === 'login'" :class="{ selected: mode === 'login' }" @click="mode = 'login'">成员登录</button><button type="button" role="tab" :aria-selected="mode === 'apply'" :class="{ selected: mode === 'apply' }" @click="mode = 'apply'">申请加入</button></div>
      <form v-if="mode === 'login'" class="lab-form" @submit.prevent="signIn"><label>邮箱<input v-model.trim="credentials.email" type="email" autocomplete="username" required /></label><label>密码<input v-model="credentials.password" type="password" autocomplete="current-password" required /></label><button class="lab-primary" :disabled="busy">登录</button></form>
      <form v-else class="lab-form" @submit.prevent="submitApply"><label>姓名<input v-model.trim="application.name" autocomplete="name" maxlength="80" required /></label><label>邮箱<input v-model.trim="application.email" type="email" autocomplete="email" required /></label><label>想加入的团队<select v-model="application.team" required><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label><label>申请说明<textarea v-model.trim="application.statement" rows="4" maxlength="1000" placeholder="说说你感兴趣的方向和想尝试的事" required></textarea></label><label>设置登录密码（至少 10 位）<input v-model="application.password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required /></label><button class="lab-primary" :disabled="busy">提交申请</button></form>
    </template>
    <template v-else>
      <div class="lab-member-bar"><div><strong>{{ user.name }}</strong><span>{{ user.role === 'admin' ? '管理员' : teamName(user.team) }} · {{ statusText[user.status] }}</span></div><button type="button" class="lab-outline" @click="signOut">退出登录</button></div>
      <p v-if="user.status !== 'approved' && user.role !== 'admin'" class="lab-notice">{{ user.status === 'pending' ? '申请等待审核。公开内容仍可直接浏览；内部资料将在审核通过后开放。' : '申请未通过，如有疑问请联系实验室管理员。' }}</p>
      <section v-if="user.role === 'admin'" class="lab-panel"><h2>加入申请审核</h2><p v-if="!applications.length">暂无申请。</p><div v-for="entry in applications" :key="entry.id" class="lab-row"><div><strong>{{ entry.name }} · {{ teamName(entry.team) }}</strong><span>{{ entry.email }} · {{ statusText[entry.status] }} · {{ entry.created_at.slice(0, 10) }}</span><p>{{ entry.statement }}</p></div><div v-if="entry.status === 'pending'" class="lab-row-actions"><button class="lab-primary" type="button" @click="review(entry, 'approved')">通过</button><button class="lab-outline" type="button" @click="review(entry, 'rejected')">拒绝</button></div></div></section>
      <section v-if="user.role === 'admin'" class="lab-panel"><h2>发布团队资源</h2><p>在这里发布实际的文字资料、学习步骤或代码片段；团队资料仅向该团队审核通过的成员开放。</p><form class="lab-form lab-form-wide" @submit.prevent="publish"><label>所属团队<select v-model="draft.team"><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label><label>访问范围<select v-model="draft.visibility"><option value="public">所有人可访问</option><option value="team">仅该团队成员</option></select></label><label>标题<input v-model.trim="draft.title" maxlength="120" required /></label><label>摘要<input v-model.trim="draft.summary" maxlength="500" required /></label><label class="lab-span">正文 / 代码片段<textarea v-model.trim="draft.body" rows="8" maxlength="30000" required></textarea></label><button class="lab-primary" :disabled="busy">发布资源</button></form></section>
      <section class="lab-panel"><h2>账号安全</h2><form class="lab-form" @submit.prevent="updatePassword"><label>当前密码<input v-model="passwords.oldPassword" type="password" autocomplete="current-password" required /></label><label>新密码（至少 10 位）<input v-model="passwords.newPassword" type="password" autocomplete="new-password" minlength="10" required /></label><button class="lab-outline" :disabled="busy">修改密码</button></form></section>
    </template>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { teams, teamName } from '../lab'
import * as api from '../api/platform'
const route = useRoute()
const mode = ref(route.query.mode === 'apply' ? 'apply' : 'login')
const user = ref(null), applications = ref([]), loading = ref(true), busy = ref(false), error = ref(''), message = ref('')
const credentials = reactive({ email: '', password: '' })
const application = reactive({ name: '', email: '', team: teams.some(t => t.id === route.query.team) ? route.query.team : 'software', statement: '', password: '' })
const draft = reactive({ team: 'software', visibility: 'public', title: '', summary: '', body: '' })
const passwords = reactive({ oldPassword: '', newPassword: '' })
const statusText = { pending: '待审核', approved: '已通过', rejected: '未通过' }
async function run(action) { busy.value = true; error.value = ''; message.value = ''; try { await action() } catch (e) { error.value = e.message || '操作失败' } finally { busy.value = false } }
async function refresh() { user.value = (await api.getMe()).data; if (user.value?.role === 'admin') applications.value = (await api.listApplications()).data }
onMounted(async () => { try { await refresh() } catch (e) { error.value = e.message } finally { loading.value = false } })
function submitApply() { run(async () => { await api.apply(application); mode.value = 'login'; credentials.email = application.email; message.value = '申请已提交。请登录查看审核进度。' }) }
function signIn() { run(async () => { user.value = (await api.login(credentials)).data; credentials.password = ''; if (user.value.role === 'admin') applications.value = (await api.listApplications()).data }) }
function signOut() { run(async () => { await api.logout(); user.value = null; applications.value = [] }) }
function review(entry, status) { run(async () => { await api.reviewApplication(entry.id, status); applications.value = (await api.listApplications()).data; message.value = '审核结果已保存。' }) }
function publish() { run(async () => { await api.publishResource(draft); draft.title = ''; draft.summary = ''; draft.body = ''; message.value = '资源已发布，可在资源库查看。' }) }
function updatePassword() { run(async () => { await api.changePassword(passwords); user.value = null; passwords.oldPassword = ''; passwords.newPassword = ''; message.value = '密码已修改，请重新登录。' }) }
</script>
