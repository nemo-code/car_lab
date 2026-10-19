<template>
  <div class="lab-wrap lab-portal lab-section">
    <div class="lab-heading"><span class="lab-eyebrow">实验室成员</span><h1>加入实验室</h1><p>申请加入团队，查看审核进度。已有账号可以直接登录成员中心。</p></div>
    <p v-if="message" class="lab-notice" role="status">{{ message }}</p><p v-if="error" class="lab-error" role="alert">{{ error }}</p>
    <div v-if="loading" class="lab-notice">正在加载…</div>
    <template v-else-if="user">
      <section class="lab-panel lab-portal-next"><h2>{{ user.role === 'admin' ? '管理员后台' : '成员中心' }}</h2><p>{{ user.role === 'admin' ? '审核申请、管理成员和维护团队资源。' : '查看申请状态与已获授权的团队资料。' }}</p><router-link class="lab-primary" :to="user.role === 'admin' ? '/admin' : '/member'">进入{{ user.role === 'admin' ? '管理后台' : '成员中心' }}</router-link><button class="lab-outline" type="button" @click="signOut">退出登录</button></section>
    </template>
    <template v-else>
      <div class="lab-switch" role="tablist" aria-label="登录或申请" @keydown="handleTablistKeydown">
        <button id="portal-tab-login" type="button" role="tab" aria-controls="portal-panel" :aria-selected="mode === 'login'" :tabindex="mode === 'login' ? 0 : -1" :class="{ selected: mode === 'login' }" @click="mode = 'login'">成员登录</button>
        <button id="portal-tab-apply" type="button" role="tab" aria-controls="portal-panel" :aria-selected="mode === 'apply'" :tabindex="mode === 'apply' ? 0 : -1" :class="{ selected: mode === 'apply' }" @click="mode = 'apply'">申请加入</button>
      </div>
      <div v-if="mode === 'login'" id="portal-panel" class="portal-tabpanel" role="tabpanel" aria-labelledby="portal-tab-login" tabindex="0"><form class="lab-form" @submit.prevent="signIn"><label>学号或用户名<input v-model.trim="credentials.account" autocomplete="username" placeholder="学号或用户名" :aria-invalid="!!loginIdError" :aria-describedby="loginIdError ? 'login-id-error' : undefined" required /><small v-if="loginIdError" id="login-id-error" class="lab-field-error" role="alert">{{ loginIdError }}</small></label><label>密码<input v-model="credentials.password" type="password" autocomplete="current-password" required /></label><button class="lab-primary" :disabled="busy">登录</button></form></div>
      <div v-else id="portal-panel" class="portal-tabpanel" role="tabpanel" aria-labelledby="portal-tab-apply" tabindex="0"><form class="lab-form" @submit.prevent="submitApply"><p v-if="!teams.length" class="lab-notice" role="status">目前没有开放申请的团队，请稍后再试。</p><label>姓名<input v-model.trim="application.name" autocomplete="name" maxlength="80" required /></label><label>学号<input v-model.trim="application.studentId" inputmode="numeric" autocomplete="off" maxlength="11" placeholder="例如 25010720732" :aria-invalid="!!studentIdError" :aria-describedby="studentIdError ? 'student-id-error' : undefined" required /><small v-if="studentIdError" id="student-id-error" class="lab-field-error" role="alert">{{ studentIdError }}</small></label><label>用户名（选填）<input v-model.trim="application.username" autocomplete="username" maxlength="30" placeholder="3-30 位小写英文用户名" :aria-invalid="!!usernameError" :aria-describedby="usernameError ? 'username-error' : undefined" /><small v-if="usernameError" id="username-error" class="lab-field-error" role="alert">{{ usernameError }}</small></label><label>想加入的团队<select v-model="application.team" required><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label><label>申请说明（选填）<textarea v-model.trim="application.statement" rows="4" maxlength="1000" placeholder="可以简单介绍你的兴趣方向，也可以留空"></textarea></label><label>设置登录密码（至少 10 位）<input v-model="application.password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required /></label><button class="lab-primary" :disabled="busy || !teams.length">提交申请</button></form></div>
    </template>
  </div>
</template>
<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTeamsStore } from '../stores/teams'
import * as api from '../api/platform'
import { handleTablistKeydown } from '../utils/accessibility'
const route = useRoute(), router = useRouter(), mode = ref(route.query.mode === 'apply' ? 'apply' : 'login')
const teamsStore = useTeamsStore(), teams = computed(() => teamsStore.publicData)
const user = ref(null), loading = ref(true), busy = ref(false), error = ref(''), message = ref('')
const credentials = reactive({ account: '', password: '' })
const application = reactive({ name: '', studentId: '', username: '', team: teamsStore.publicData.some(t => t.id === route.query.team) ? route.query.team : 'software', statement: '', password: '' })
watch(() => route.query.mode, value => { mode.value = value === 'apply' ? 'apply' : 'login' })
const studentIdError = computed(() => application.studentId && !/^\d{11}$/.test(application.studentId) ? '学号必须是 11 位数字' : '')
const loginIdError = computed(() => /^\d+$/.test(credentials.account) && credentials.account.length !== 11 ? '学号必须是 11 位数字' : '')
const usernameError = computed(() => application.username && !/^[a-z][a-z0-9_.-]{2,29}$/.test(application.username.toLowerCase()) ? '用户名须为 3-30 位小写英文，以字母开头，可包含字母、数字、_、-、.' : '')
async function run(action) { busy.value = true; error.value = ''; message.value = ''; try { await action() } catch (e) { error.value = e.message || '操作失败' } finally { busy.value = false } }
onMounted(async () => {
  try {
    await teamsStore.loadTeams()
    if (route.query.team && teams.value.some(team => team.id === route.query.team)) application.team = route.query.team
    else if (!teams.value.some(team => team.id === application.team)) application.team = teams.value[0]?.id || 'software'
    user.value = (await api.getMe()).data
  } catch (e) { error.value = e.message || '暂时无法加载登录状态' } finally { loading.value = false }
})
function submitApply() { if (studentIdError.value || usernameError.value) return; run(async () => { await api.apply(application); mode.value = 'login'; credentials.account = application.studentId; await router.replace({ query: { ...route.query, mode: 'login' } }); message.value = '申请已提交。请登录查看审核进度。' }) }
function signIn() {
  if (loginIdError.value) return
  run(async () => {
    user.value = (await api.login(credentials)).data
    credentials.password = ''
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//')
      ? route.query.redirect
      : (user.value.role === 'admin' ? '/admin' : '/member')
    await router.replace(redirect)
  })
}
function signOut() { run(async () => { await api.logout(); user.value = null }) }
</script>
