<template>
  <div class="lab-wrap lab-portal lab-section">
    <div class="lab-heading"><span class="lab-eyebrow">成员中心</span><h1>我的实验室空间</h1><p>查看申请状态，并阅读已获授权的团队资料。</p></div>
    <p v-if="error" class="lab-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="lab-notice" role="status">{{ notice }}</p>
    <div v-if="loading" class="lab-notice">正在加载…</div>
    <template v-else-if="user">
      <div class="lab-member-bar"><div><strong>{{ user.name }}</strong><span>{{ teamName(user.team) }}<template v-if="user.grade"> · {{ user.grade }}</template> · {{ statusText[user.status] }}</span></div><button type="button" class="lab-outline" @click="signOut">退出登录</button></div>
      <p v-if="user.status !== 'approved'" class="lab-notice">{{ user.status === 'pending' ? '申请等待审核。公开内容仍可直接浏览；内部资料将在审核通过后开放。' : '申请未通过，如有疑问请联系实验室管理员。' }}</p>
      <section class="lab-panel member-memberships"><h2>我的团队</h2><div class="membership-list"><span v-for="membership in user.memberships || []" :key="membership.id" class="membership-chip">{{ teamName(membership.team) }} · {{ membershipStatusText[membership.status] || membership.status }}</span></div><form v-if="user.role === 'member' && availableTeams.length" class="lab-form lab-form-inline" @submit.prevent="submitTeamApplication"><label>申请加入其他团队<select v-model="teamApplication.team" required><option value="" disabled>选择团队</option><option v-for="team in availableTeams" :key="team.id" :value="team.code">{{ team.name }}</option></select></label><label>申请说明（选填）<input v-model.trim="teamApplication.statement" maxlength="1000" /></label><button class="lab-outline" :disabled="busy">提交申请</button></form><p v-else-if="user.role === 'member'" class="lab-empty">当前已加入或申请了全部启用团队。</p></section>
      <section class="lab-panel"><h2>团队资源</h2><p v-if="!resources.length" class="lab-empty">当前没有已发布的团队资源。</p><div v-for="item in resources" :key="item.id" class="lab-resource-item"><div><span class="lab-eyebrow">{{ teamName(item.team) }} · {{ item.visibility === 'public' ? '公开' : '团队内部' }}</span><h3>{{ item.title }}</h3><p>{{ item.summary }}</p></div><button type="button" class="lab-outline" @click="openResource(item, $event)">{{ item.visibility === 'public' || hasApprovedMembership(item.team) ? '阅读资料' : '需要审核' }}</button></div></section>
      <section class="lab-panel"><h2>账号安全</h2><form class="lab-form" @submit.prevent="updatePassword"><label>当前密码<input v-model="passwords.oldPassword" type="password" autocomplete="current-password" required /></label><label>新密码（至少 10 位）<input v-model="passwords.newPassword" type="password" autocomplete="new-password" minlength="10" required /></label><button class="lab-outline" :disabled="busy">修改密码</button></form></section>
    </template>
    <p v-else class="lab-notice">登录后才能进入成员中心。<router-link to="/portal">返回登录</router-link></p>
    <div v-if="openedResource" class="detail-backdrop" @click.self="closeResource"><aside ref="resourceDialog" class="detail-panel" role="dialog" aria-modal="true" aria-labelledby="member-resource-title" tabindex="-1" @keydown="handleResourceDialogKeydown"><button type="button" class="close-button" aria-label="关闭资源详情" @click="closeResource">×</button><p class="eyebrow">{{ teamName(openedResource.team) }}</p><h2 id="member-resource-title">{{ openedResource.title }}</h2><pre class="lab-resource-body">{{ openedResource.body }}</pre><a v-if="fileUrl" class="lab-outline" :href="fileUrl" target="_blank" rel="noopener" download>{{ openedResource.filename || '下载附件' }}</a><p v-else-if="openedResource.file && fileLoading" class="lab-notice">正在准备附件下载…</p></aside></div>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTeamsStore } from '../stores/teams'
import * as api from '../api/platform'
import { handleDialogKeydown } from '../utils/accessibility'
const router = useRouter()
const teamsStore = useTeamsStore()
const teamName = id => teamsStore.publicData.find(team => team.id === id || team.code === id)?.name || id
const user = ref(null), resources = ref([]), openedResource = ref(null), fileUrl = ref(''), fileLoading = ref(false), loading = ref(true), busy = ref(false), error = ref(''), notice = ref(''), resourceTrigger = ref(null), resourceDialog = ref(null)
const passwords = reactive({ oldPassword: '', newPassword: '' })
const teamApplication = reactive({ team: '', statement: '' })
const statusText = { pending: '待审核', approved: '已通过', rejected: '未通过' }
const membershipStatusText = { pending: '待审核', approved: '已通过', rejected: '未通过', revoked: '已撤销' }
const availableTeams = computed(() => teamsStore.publicData.filter(team => !(user.value?.memberships || []).some(membership => (membership.team === team.code || membership.team === team.id) && membership.is_active !== false && ['pending', 'approved'].includes(membership.status))))
const hasApprovedMembership = team => user.value?.role === 'admin' || (user.value?.memberships || []).some(membership => membership.team === team && membership.status === 'approved' && membership.is_active !== false)
onMounted(async () => { try { await teamsStore.loadTeams(); user.value = (await api.getMe()).data; if (user.value) resources.value = (await api.listResources()).data } catch (e) { error.value = e.message || '暂时无法加载成员空间' } finally { loading.value = false } })
async function submitTeamApplication() { busy.value = true; error.value = ''; notice.value = ''; try { await api.applyTeam(teamApplication); user.value = (await api.getMe()).data; teamApplication.team = ''; teamApplication.statement = ''; notice.value = '团队申请已提交，请等待管理员审核。' } catch (e) { error.value = e.message || '团队申请提交失败' } finally { busy.value = false } }
async function openResource(item, event) { resourceTrigger.value = event?.currentTarget || null; try { openedResource.value = (await api.readResource(item.id)).data; fileUrl.value = ''; if (openedResource.value.file) { fileLoading.value = true; fileUrl.value = await api.getProtectedResourceFileUrl(openedResource.value) } } catch (e) { error.value = e.message || '当前账号无权阅读该资料' } finally { fileLoading.value = false } }
function closeResource() { openedResource.value = null; nextTick(() => resourceTrigger.value?.focus?.()) }
function handleResourceDialogKeydown(event) { handleDialogKeydown(event, closeResource) }
watch(openedResource, value => { document.body.classList.toggle('modal-open', Boolean(value)); if (value) nextTick(() => resourceDialog.value?.querySelector('.close-button')?.focus()) })
onBeforeUnmount(() => { document.body.classList.remove('modal-open') })
async function signOut() { await api.logout(); await router.replace('/portal') }
async function updatePassword() { busy.value = true; error.value = ''; try { await api.changePassword(passwords); await router.replace('/portal?mode=login') } catch (e) { error.value = e.message || '密码修改失败' } finally { busy.value = false } }
</script>
