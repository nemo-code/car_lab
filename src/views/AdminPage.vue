<template>
  <div class="lab-wrap lab-admin lab-section">
    <div class="lab-heading"><span class="lab-eyebrow">实验室管理</span><h1>管理员工作台</h1><p>集中处理加入申请、成员状态和团队资源。</p><button v-if="user?.role === 'admin'" class="lab-outline" type="button" @click="signOut">退出登录</button></div>
    <p v-if="message" class="lab-notice" role="status">{{ message }}</p><p v-if="error" class="lab-error" role="alert">{{ error }}</p><p v-if="uploadProgress !== null" class="lab-notice" role="status">正在上传文件：{{ uploadProgress }}%</p>
    <div v-if="loading" class="lab-notice">正在加载…</div>
    <template v-else-if="user?.role === 'admin'">
      <div class="admin-workspace">
        <nav class="admin-tabs" role="tablist" aria-label="管理模块" :aria-orientation="verticalTabs ? 'vertical' : 'horizontal'" @keydown="handleTablistKeydown"><button v-for="item in tabs" :id="`admin-tab-${item.id}`" :key="item.id" type="button" role="tab" :aria-selected="tab === item.id" aria-controls="admin-panel" :tabindex="tab === item.id ? 0 : -1" :class="{ selected: tab === item.id }" @click="tab = item.id">{{ item.label }}</button></nav>
        <div id="admin-panel" class="admin-content" role="tabpanel" :aria-labelledby="`admin-tab-${tab}`" tabindex="0">
      <section v-if="tab === 'applications'" class="lab-panel">
        <div class="admin-section-heading admin-list-heading"><div><h2>加入申请审核</h2><p>按姓名、学号、用户名或团队快速定位申请。</p></div><div class="admin-list-tools"><label>搜索申请<input v-model.trim="applicationQuery" type="search" placeholder="姓名、学号或用户名" /></label><label>状态<select v-model="applicationStatus"><option value="all">全部状态</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">未通过</option></select></label></div></div>
        <p v-if="!filteredApplications.length" class="lab-empty">没有匹配的申请。</p>
        <div v-for="entry in pagedApplications" :key="entry.id" class="lab-row"><div><strong>{{ entry.name }} · {{ teamName(entry.team) }}</strong><span>{{ entry.student_id || entry.email }}{{ entry.username ? ' · ' + entry.username : '' }} · {{ entry.grade }} · {{ statusText[entry.status] }} · {{ entry.created_at.slice(0, 10) }}</span><p>{{ entry.statement || '未填写申请说明' }}</p></div><div v-if="entry.status === 'pending'" class="lab-row-actions"><button class="lab-primary" type="button" @click="review(entry, 'approved')">通过</button><button class="lab-outline" type="button" @click="review(entry, 'rejected')">拒绝</button></div></div>
        <div v-if="filteredApplications.length" class="admin-pagination"><span>第 {{ applicationPage }} / {{ applicationPageCount }} 页，共 {{ filteredApplications.length }} 条</span><div><button class="lab-outline" type="button" :disabled="applicationPage <= 1" @click="applicationPage -= 1">上一页</button><button class="lab-outline" type="button" :disabled="applicationPage >= applicationPageCount" @click="applicationPage += 1">下一页</button></div></div>
      </section>
      <section v-if="tab === 'members'" class="lab-panel">
        <div class="admin-section-heading admin-list-heading"><div><h2>成员管理</h2><p>按姓名、学号、年级、团队或状态筛选成员。</p></div><div class="admin-list-tools"><label>搜索成员<input v-model.trim="memberQuery" type="search" placeholder="姓名、学号或用户名" /></label><label>团队<select v-model="memberTeam"><option value="all">全部团队</option><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label><label>状态<select v-model="memberStatus"><option value="all">全部状态</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">未通过</option><option value="inactive">已停用</option></select></label></div></div>
        <p v-if="!filteredMembers.length" class="lab-empty">没有匹配的成员。</p>
        <div v-else class="admin-table-wrap"><table class="admin-table"><thead><tr><th>成员</th><th>团队</th><th>状态</th><th>账号</th><th>操作</th></tr></thead><tbody><tr v-for="member in pagedMembers" :key="member.id"><td><strong>{{ member.name }}</strong><small>{{ member.student_id || member.email }}{{ member.grade ? ` · ${member.grade}` : '' }}</small></td><td>{{ teamName(member.team) }}</td><td>{{ statusText[member.status] }} · {{ member.is_active ? '启用' : '已停用' }}</td><td>{{ member.role === 'admin' ? '管理员' : '成员' }}</td><td><div class="lab-row-actions"><button v-if="member.role !== 'admin'" class="lab-outline" type="button" @click="toggleMember(member)">{{ member.is_active ? '停用账号' : '恢复账号' }}</button><button v-if="member.role !== 'admin'" class="lab-outline" type="button" @click="resetPassword(member, $event)">重置密码</button></div></td></tr></tbody></table></div>
        <div v-if="filteredMembers.length" class="admin-pagination"><span>第 {{ memberPage }} / {{ memberPageCount }} 页，共 {{ filteredMembers.length }} 条</span><div><button class="lab-outline" type="button" :disabled="memberPage <= 1" @click="memberPage -= 1">上一页</button><button class="lab-outline" type="button" :disabled="memberPage >= memberPageCount" @click="memberPage += 1">下一页</button></div></div>
        <div class="admin-subsection">
          <div class="admin-section-heading"><div><h3>团队成员关系</h3><p>独立管理每个成员与团队的审核、撤销和恢复状态。</p></div></div>
          <p v-if="!memberships.length" class="lab-empty">暂无团队成员关系。</p>
          <div v-else class="admin-table-wrap"><table class="admin-table"><thead><tr><th>成员</th><th>团队</th><th>关系状态</th><th>加入时间</th><th>操作</th></tr></thead><tbody><tr v-for="membership in memberships" :key="membership.id"><td><strong>{{ membership.name }}</strong><small>{{ membership.student_id || membership.username || '未设置登录标识' }}{{ membership.grade ? ` · ${membership.grade}` : '' }}</small></td><td>{{ teamName(membership.team) }}</td><td>{{ membershipStatusText[membership.status] || membership.status }} · {{ membership.is_active ? '启用' : '停用' }}</td><td>{{ formatDate(membership.joined_at || membership.created_at) }}</td><td><div v-if="membership.user_role !== 'admin'" class="lab-row-actions"><button v-if="membership.status !== 'revoked' || membership.is_active" class="lab-outline danger" type="button" @click="revokeMembership(membership)">撤销关系</button><button v-else class="lab-outline" type="button" @click="restoreMembership(membership)">恢复关系</button></div><span v-else class="lab-muted">管理员关系</span></td></tr></tbody></table></div>
        </div>
      </section>
      <section v-if="tab === 'teams'" class="lab-panel"><div class="admin-section-heading"><div><h2>团队内容</h2><p>维护公开导航、首页研究方向、团队详情和申请选项使用的统一内容。</p></div></div><div class="lab-resource-list"><article v-for="item in teams" :key="item.id" class="lab-resource-item"><div><span class="lab-eyebrow">{{ item.enabled ? '已启用' : '已停用' }} · {{ item.code }}</span><h3>{{ item.name }}</h3><p>{{ item.caption }}</p></div><button class="lab-outline" type="button" @click="editTeam(item)">编辑</button></article></div><form v-if="teamDraft.id" class="lab-form lab-form-wide" @submit.prevent="saveTeam"><label>名称<input v-model.trim="teamDraft.name" maxlength="80" required /></label><label>导航短句<input v-model.trim="teamDraft.caption" maxlength="160" required /></label><label>展示图片路径<input v-model.trim="teamDraft.image" maxlength="500" required /></label><label class="lab-span">团队介绍<textarea v-model.trim="teamDraft.intro" rows="5" maxlength="2000" required></textarea></label><label class="lab-span">学习内容（每行一项）<textarea v-model="teamDraft.learnText" rows="5" required></textarea></label><label class="lab-span">实践方式<textarea v-model.trim="teamDraft.practice" rows="4" maxlength="1000" required></textarea></label><label>排序号<input v-model.number="teamDraft.sort_order" type="number" min="0" max="9999" /></label><label class="admin-checkbox"><input v-model="teamDraft.enabled" type="checkbox" /> 对外显示</label><button class="lab-primary" :disabled="busy">保存团队内容</button></form><p v-else class="lab-empty">选择一个团队开始编辑。</p></section>
      <section v-if="tab === 'resources'" class="lab-panel"><div class="admin-section-heading"><div><h2>资源管理</h2><p>保存草稿，审核内容和权限后再发布；已下线资源仍可恢复。</p></div><button class="lab-outline" type="button" @click="startNewResource">新建资源</button></div><p v-if="!resources.length" class="lab-empty">暂无资源，可先保存草稿。</p><div class="lab-resource-list"><article v-for="item in resources" :key="item.id" class="lab-resource-item"><div><span class="lab-eyebrow">{{ teamName(item.team) }} · {{ item.visibility === 'public' ? '公开' : item.visibility === 'admin' ? '管理员' : '团队内部' }} · {{ resourceStatusText[item.status] || item.status }}</span><h3>{{ item.title }}</h3><p>{{ item.summary }}</p><small v-if="item.file">附件：{{ item.filename || item.file }}（{{ formatBytes(item.size) }}）</small><small v-else>暂无附件</small></div><div class="lab-row-actions"><button class="lab-outline" type="button" @click="editResource(item)">编辑</button><button v-if="item.status !== 'published'" class="lab-outline" type="button" @click="changeResourceStatus(item, 'published')">{{ item.status === 'offline' ? '恢复发布' : '发布' }}</button><button v-if="item.status !== 'draft'" class="lab-outline" type="button" @click="changeResourceStatus(item, 'draft')">转为草稿</button><button v-if="item.status !== 'offline'" class="lab-outline danger" type="button" @click="changeResourceStatus(item, 'offline')">下线</button></div></article></div><form class="lab-form lab-form-wide" @submit.prevent="saveResource"><label>所属团队<select v-model="draft.team"><option v-for="team in teams" :key="team.id" :value="team.id">{{ team.name }}</option></select></label><label>访问范围<select v-model="draft.visibility"><option value="public">所有人可访问</option><option value="team">仅该团队成员</option><option value="admin">仅管理员</option></select></label><label>发布状态<select v-model="draft.status"><option value="draft">草稿</option><option value="published">已发布</option><option value="offline">已下线</option></select></label><label>标题<input v-model.trim="draft.title" maxlength="120" required /></label><label>摘要<input v-model.trim="draft.summary" maxlength="500" required /></label><label class="lab-span">正文 / 代码片段<textarea v-model.trim="draft.body" rows="8" maxlength="30000" required></textarea></label><label class="lab-span">附件 <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx" @change="selectFile" /><small v-if="draft.existingFile">当前附件：{{ draft.existingFile.filename || draft.existingFile.file }}（{{ formatBytes(draft.existingFile.size) }}）</small><small v-if="draft.file">待上传：{{ draft.file.name }}（{{ formatBytes(draft.file.size) }}）</small><small v-if="uploadProgress !== null" role="status">正在上传附件：{{ uploadProgress }}%</small><button v-if="draft.id && draft.existingFile?.file" class="lab-outline danger" type="button" @click="removeResourceAttachment">移除当前附件</button><small>支持 PDF、图片、Office、ZIP 和文本文件，单个附件不超过 30 MiB。</small></label><button class="lab-primary" :disabled="busy">{{ draft.id ? '保存资源' : draft.status === 'published' ? '发布资源' : draft.status === 'offline' ? '保存为下线' : '保存草稿' }}</button></form></section>
      <section v-if="tab === 'projects'" class="lab-panel"><div class="admin-section-heading"><div><h2>项目成果</h2><p>维护官网项目目录、展示顺序和已有图片/视频/成果文件引用。缺失的历史素材只保存为待补充路径，不会生成死链。</p></div><button class="lab-outline" type="button" @click="startNewProject">新建项目</button></div><div class="lab-resource-list"><article v-for="item in projects" :key="item.id" class="lab-resource-item"><div><span class="lab-eyebrow">{{ item.edition }} · {{ item.categoryLabel }} · {{ projectStatusText[item.status] }}</span><h3>{{ item.title }}</h3><p>{{ item.summary }}</p><small>{{ item.media.length }} 张图片 · {{ item.videos.length }} 个视频引用 · {{ item.files.length }} 个成果文件引用 · {{ item.assets?.length || 0 }} 个受控素材</small></div><div class="lab-row-actions"><button class="lab-outline" type="button" @click="editProject(item)">编辑</button><button v-if="item.status !== 'offline'" class="lab-outline danger" type="button" @click="removeProject(item)">下线</button></div></article></div><form class="lab-form lab-form-wide project-admin-form" @submit.prevent="saveProject"><label>项目标识（slug）<input v-model.trim="projectDraft.slug" pattern="[a-z0-9][a-z0-9\-]{1,79}" maxlength="80" required /></label><label>成果批次<input v-model.trim="projectDraft.edition" maxlength="80" required /></label><label>项目小组<input v-model.trim="projectDraft.group" maxlength="120" required /></label><label>项目分类<select v-model="projectDraft.category"><option value="hardware">硬件实物</option><option value="software">软件系统</option><option value="game">仿真交互</option></select></label><label>分类标签<input v-model.trim="projectDraft.categoryLabel" maxlength="80" required /></label><label>排序号<input v-model.number="projectDraft.sort_order" type="number" min="0" max="9999" /></label><label>标题<input v-model.trim="projectDraft.title" maxlength="200" required /></label><label>副标题<input v-model.trim="projectDraft.subtitle" maxlength="300" required /></label><label>视觉色彩<input v-model.trim="projectDraft.accent" maxlength="40" /></label><label>发布状态<select v-model="projectDraft.status"><option value="draft">草稿</option><option value="published">已发布</option><option value="offline">已下线</option></select></label><label class="lab-span">项目简介<textarea v-model.trim="projectDraft.summary" rows="4" maxlength="2000" required></textarea></label><label>参与成员<input v-model.trim="projectDraft.members" maxlength="500" /></label><label>历史标识<input v-model.trim="projectDraft.legacy_id" maxlength="80" /></label><label>标签（每行一项）<textarea v-model="projectDraft.tagsText" rows="4"></textarea></label><label>实践亮点（每行一项）<textarea v-model="projectDraft.highlightsText" rows="5"></textarea></label><label>项目结果（每行一项）<textarea v-model="projectDraft.outcomesText" rows="4"></textarea></label><label>技术栈（每行一项）<textarea v-model="projectDraft.techText" rows="4"></textarea></label><label class="lab-span">图片路径（每行一项，支持 `assets/...`、绝对 URL）<textarea v-model="projectDraft.mediaText" rows="4" placeholder="assets/项目图片.png"></textarea></label><label class="lab-span">视频引用（每行 `名称 | 路径`）<textarea v-model="projectDraft.videosText" rows="4" placeholder="演示视频 | ../项目组/演示视频.mp4"></textarea></label><label class="lab-span">成果文件引用（每行 `名称 | 路径`）<textarea v-model="projectDraft.filesText" rows="4" placeholder="项目报告 | ../项目组/项目报告.docx"></textarea></label><button class="lab-primary" :disabled="busy">{{ projectDraft.id ? '保存项目' : '发布项目' }}</button></form><div class="project-assets-admin"><div class="admin-section-heading"><div><h3>受控项目素材</h3><p>上传后的素材保存在受保护目录，只有已发布项目中的已发布素材才会出现在公开页。</p></div></div><p v-if="!projectDraft.id" class="lab-empty">保存项目后才能添加受控素材。</p><template v-else><p v-if="!projectAssets.length" class="lab-empty">暂无受控素材，可添加历史引用或上传文件。</p><div class="lab-resource-list"><article v-for="asset in projectAssets" :key="asset.id" class="lab-resource-item"><div><span class="lab-eyebrow">{{ asset.kind }} · {{ asset.source_type }} · {{ projectAssetStatusText(asset) }}</span><h3>{{ asset.label }}</h3><p>{{ asset.filename || asset.legacy_path || '未填写路径' }}<span v-if="asset.size"> · {{ formatBytes(asset.size) }}</span></p><a v-if="asset.url" :href="asset.url" target="_blank" rel="noreferrer">打开上传文件</a></div><div class="lab-row-actions"><button class="lab-outline" type="button" @click="editProjectAsset(asset)">编辑</button><button v-if="asset.availability !== 'offline'" class="lab-outline danger" type="button" @click="removeProjectAsset(asset)">下线</button></div></article></div><form class="lab-form lab-form-wide project-asset-form" @submit.prevent="saveProjectAsset"><label>素材类型<select v-model="assetDraft.kind"><option value="image">图片</option><option value="video">视频</option><option value="file">成果文件</option></select></label><label>素材名称<input v-model.trim="assetDraft.label" maxlength="160" required /></label><label>历史路径<input v-model.trim="assetDraft.legacy_path" maxlength="500" placeholder="../项目组/演示视频.mp4" /></label><label>来源<select v-model="assetDraft.source_type"><option value="legacy">历史引用</option><option value="upload">上传文件</option></select></label><label>排序号<input v-model.number="assetDraft.sort_order" type="number" min="0" max="9999" /></label><label class="admin-checkbox"><input v-model="assetDraft.published" type="checkbox" /> 对外发布</label><label class="lab-span">上传文件<input type="file" :accept="projectAssetAccept" @change="selectProjectAssetFile" /><small v-if="assetDraft.file">待上传：{{ assetDraft.file.name }}（{{ formatBytes(assetDraft.file.size) }}）</small><small>单个文件不超过 30 MiB；视频和文档上传仍受后端 MIME 白名单约束。</small></label><div class="lab-row-actions lab-span"><button class="lab-primary" :disabled="busy">{{ assetDraft.id ? '保存素材' : '添加素材' }}</button><button class="lab-outline" type="button" @click="resetProjectAsset">清空</button></div></form></template></div></section>
      <section v-if="tab === 'announcements'" class="lab-panel"><div class="admin-section-heading"><div><h2>新闻公告</h2><p>用结构化字段维护通知和新闻；草稿不会出现在公开页面。</p></div><button class="lab-outline" type="button" @click="startNewAnnouncement">新建公告</button></div><div class="lab-resource-list"><article v-for="item in announcements" :key="item.id" class="lab-resource-item"><div><span class="lab-eyebrow">{{ item.pinned ? '置顶 · ' : '' }}{{ item.kind === 'news' ? '新闻' : '通知' }} · {{ announcementStatusText[item.status] }}</span><h3>{{ item.title }}</h3><p>{{ item.summary }}</p></div><div class="lab-row-actions"><button class="lab-outline" type="button" @click="editAnnouncement(item)">编辑</button><button v-if="item.status !== 'offline'" class="lab-outline danger" type="button" @click="removeAnnouncement(item)">下线</button></div></article></div><form class="lab-form lab-form-wide" @submit.prevent="saveAnnouncement"><label>标识（slug）<input v-model.trim="announcementDraft.slug" pattern="[a-z0-9][a-z0-9\-]{1,79}" maxlength="80" required /></label><label>类型<select v-model="announcementDraft.kind"><option value="notice">通知</option><option value="news">新闻</option></select></label><label>标题<input v-model.trim="announcementDraft.title" maxlength="160" required /></label><label>排序号<input v-model.number="announcementDraft.sort_order" type="number" min="0" max="9999" /></label><label class="admin-checkbox"><input v-model="announcementDraft.pinned" type="checkbox" /> 置顶</label><label>状态<select v-model="announcementDraft.status"><option value="draft">草稿</option><option value="published">已发布</option><option value="offline">已下线</option></select></label><label class="lab-span">摘要<textarea v-model.trim="announcementDraft.summary" rows="3" maxlength="500"></textarea></label><label class="lab-span">正文<textarea v-model.trim="announcementDraft.body" rows="10" maxlength="20000" required></textarea></label><button class="lab-primary" :disabled="busy">{{ announcementDraft.id ? '保存公告' : '创建公告' }}</button></form></section>
      <section v-if="tab === 'content'" class="lab-panel"><div class="admin-section-heading"><div><h2>官网内容</h2><p>按区块维护公开页面内容，保存前会校验 JSON 格式和大小。</p></div></div><form class="lab-form lab-form-wide" @submit.prevent="saveContent"><label>内容区块<select v-model="contentSection" @change="loadContentDraft"><option v-for="item in contentSections" :key="item.id" :value="item.id">{{ item.label }}</option></select></label><label class="lab-span">区块内容<textarea v-model="contentDraft" rows="18" spellcheck="false" required></textarea></label><button class="lab-primary" :disabled="busy">保存官网内容</button></form></section>
      <section v-if="tab === 'audit'" class="lab-panel"><div class="admin-section-heading"><div><h2>操作日志</h2><p>仅展示必要的操作类型、对象和状态，不记录密码、令牌或申请正文。</p></div></div><p v-if="!auditLogs.length" class="lab-empty">暂无操作日志。</p><div v-for="entry in auditLogs" :key="entry.id" class="lab-row"><div><strong>{{ entry.action }}</strong><span>{{ entry.target_type }} · {{ entry.target_id }} · {{ entry.created_at.slice(0, 19).replace('T', ' ') }}</span></div><code>{{ JSON.stringify(entry.metadata) }}</code></div></section>
        </div>
      </div>
    </template>
    <p v-else class="lab-notice">当前账号没有管理员权限。<router-link to="/portal">返回登录</router-link></p>
    <div v-if="resetTarget" class="admin-reset-backdrop" @click.self="closeResetDialog">
      <form ref="resetDialog" class="admin-reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-password-title" aria-describedby="reset-password-help" @submit.prevent="submitResetPassword" @keydown="handleResetDialogKeydown">
        <button type="button" class="close-button" aria-label="关闭重置密码对话框" @click="closeResetDialog">×</button>
        <p class="lab-eyebrow">账号安全</p>
        <h2 id="reset-password-title">为{{ resetTarget.name }}重置密码</h2>
        <p id="reset-password-help" class="admin-reset-help">设置一个 10–128 位的临时密码。保存后，该账号的现有登录会话会失效。</p>
        <label class="admin-reset-field">临时密码<input ref="resetPasswordInput" v-model="resetPasswordValue" type="password" autocomplete="new-password" minlength="10" maxlength="128" required /></label>
        <label class="admin-reset-field">再次输入临时密码<input ref="resetConfirmationInput" v-model="resetPasswordConfirmation" type="password" autocomplete="new-password" minlength="10" maxlength="128" required :aria-invalid="resetPasswordMismatch || resetDialogError ? 'true' : undefined" :aria-describedby="resetPasswordMismatch || resetDialogError ? 'reset-password-error' : undefined" /></label>
        <p v-if="resetDialogError" id="reset-password-error" class="lab-error" role="alert">{{ resetDialogError }}</p>
        <div class="lab-row-actions admin-reset-actions"><button class="lab-primary" type="submit" :disabled="busy">保存临时密码</button><button class="lab-outline" type="button" @click="closeResetDialog">取消</button></div>
      </form>
    </div>
  </div>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTeamsStore } from '../stores/teams'
import * as api from '../api/platform'
import { handleTablistKeydown } from '../utils/accessibility'
import { handleDialogKeydown } from '../utils/accessibility'
import { useSiteStore } from '../stores/site'
const router = useRouter(), user = ref(null), loading = ref(true), busy = ref(false), error = ref(''), message = ref(''), uploadProgress = ref(null), tab = ref('applications')
const siteStore = useSiteStore()
const resetTarget = ref(null), resetPasswordValue = ref(''), resetPasswordConfirmation = ref(''), resetDialogError = ref(''), resetDialog = ref(null), resetPasswordInput = ref(null), resetConfirmationInput = ref(null), resetTrigger = ref(null)
const resetPasswordMismatch = computed(() => Boolean(resetPasswordConfirmation.value) && resetPasswordValue.value !== resetPasswordConfirmation.value)
const verticalTabs = ref(typeof window === 'undefined' || window.innerWidth > 700)
const teamsStore = useTeamsStore(), teams = computed(() => teamsStore.adminData), publicTeams = computed(() => teamsStore.publicData)
const teamName = id => teams.value.find(team => team.id === id || team.code === id)?.name || publicTeams.value.find(team => team.id === id || team.code === id)?.name || id
const tabs = [{ id: 'applications', label: '申请审核' }, { id: 'members', label: '成员管理' }, { id: 'teams', label: '团队内容' }, { id: 'resources', label: '资源管理' }, { id: 'projects', label: '项目成果' }, { id: 'announcements', label: '新闻公告' }, { id: 'content', label: '官网内容' }, { id: 'audit', label: '操作日志' }]
const applications = ref([]), members = ref([]), memberships = ref([]), resources = ref([]), projects = ref([]), announcements = ref([]), projectAssets = ref([]), auditLogs = ref([]), siteContent = ref({})
const contentSections = [{ id: 'brand', label: '品牌信息' }, { id: 'navigation', label: '导航' }, { id: 'footer', label: '页脚' }, { id: 'home', label: '首页' }, { id: 'about', label: '实验室介绍' }, { id: 'projects', label: '项目成果' }, { id: 'resources', label: '资源库说明' }, { id: 'services', label: '实践方向' }, { id: 'team', label: '团队' }, { id: 'contact', label: '联系信息' }]
const contentSection = ref('brand'), contentDraft = ref('')
const draft = reactive({ id: '', team: 'software', visibility: 'public', status: 'draft', retryUpload: false, retryTargetStatus: '', title: '', summary: '', body: '', file: null, existingFile: null })
const teamDraft = reactive({ id: '', name: '', caption: '', image: '', intro: '', learnText: '', practice: '', sort_order: 0, enabled: true })
const projectDraft = reactive({ id: '', legacy_id: '', edition: 'custom', slug: '', group: '', category: 'software', categoryLabel: '软件系统', title: '', subtitle: '', summary: '', members: '', accent: 'cyan', sort_order: 0, status: 'published', tagsText: '', highlightsText: '', outcomesText: '', techText: '', mediaText: '', videosText: '', filesText: '' })
const assetDraft = reactive({ id: '', kind: 'image', label: '', source_type: 'legacy', availability: 'missing', legacy_path: '', sort_order: 0, published: false, file: null })
const announcementDraft = reactive({ id: '', slug: '', title: '', summary: '', body: '', kind: 'notice', status: 'draft', pinned: false, sort_order: 0 })
const projectAssetAccept = 'image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt'
const statusText = { pending: '待审核', approved: '已通过', rejected: '未通过' }
const membershipStatusText = { pending: '待审核', approved: '已通过', rejected: '未通过', revoked: '已撤销' }
const projectStatusText = { draft: '草稿', published: '已发布', offline: '已下线' }
const resourceStatusText = { draft: '草稿', published: '已发布', offline: '已下线' }
const announcementStatusText = { draft: '草稿', published: '已发布', offline: '已下线' }
const pageSize = 10
const applicationQuery = ref(''), applicationStatus = ref('all'), applicationPage = ref(1)
const memberQuery = ref(''), memberTeam = ref('all'), memberStatus = ref('all'), memberPage = ref(1)
const filteredApplications = computed(() => {
  const query = applicationQuery.value.toLocaleLowerCase()
  return applications.value.filter(entry => {
    const matchesStatus = applicationStatus.value === 'all' || entry.status === applicationStatus.value
    const haystack = [entry.name, entry.student_id, entry.email, entry.username, entry.grade, teamName(entry.team)].filter(Boolean).join(' ').toLocaleLowerCase()
    return matchesStatus && (!query || haystack.includes(query))
  })
})
const applicationPageCount = computed(() => Math.max(1, Math.ceil(filteredApplications.value.length / pageSize)))
const pagedApplications = computed(() => filteredApplications.value.slice((applicationPage.value - 1) * pageSize, applicationPage.value * pageSize))
const filteredMembers = computed(() => {
  const query = memberQuery.value.toLocaleLowerCase()
  return members.value.filter(member => {
    const selectedTeam = memberTeam.value
    const memberTeams = [member.team, ...(Array.isArray(member.memberships) ? member.memberships.map(item => item.team) : [])].filter(Boolean)
    const matchesTeam = selectedTeam === 'all'
      || memberTeams.some(team => team === selectedTeam || teamName(team) === teamName(selectedTeam))
    const matchesStatus = memberStatus.value === 'all'
      || (memberStatus.value === 'inactive' ? !member.is_active : member.status === memberStatus.value)
    const haystack = [member.name, member.student_id, member.email, member.username, member.grade, ...memberTeams.map(teamName)].filter(Boolean).join(' ').toLocaleLowerCase()
    return matchesTeam && matchesStatus && (!query || haystack.includes(query))
  })
})
const memberPageCount = computed(() => Math.max(1, Math.ceil(filteredMembers.value.length / pageSize)))
const pagedMembers = computed(() => filteredMembers.value.slice((memberPage.value - 1) * pageSize, memberPage.value * pageSize))
watch([applicationQuery, applicationStatus], () => { applicationPage.value = 1 })
watch([memberQuery, memberTeam, memberStatus], () => { memberPage.value = 1 })
watch(applicationPageCount, count => { if (applicationPage.value > count) applicationPage.value = count })
watch(memberPageCount, count => { if (memberPage.value > count) memberPage.value = count })
async function reload() { await Promise.all([teamsStore.loadAdminTeams(true), teamsStore.loadTeams(true)]); applications.value = (await api.listApplications()).data; members.value = (await api.listMembers()).data; memberships.value = (await api.listMemberships()).data; resources.value = (await api.listAdminResources()).data; projects.value = (await api.listAdminProjects()).data; announcements.value = (await api.listAdminAnnouncements()).data; if (projectDraft.id) await loadProjectAssets(projectDraft.id); siteContent.value = (await api.getAdminSite()).data; auditLogs.value = (await api.listAuditLogs()).data; loadContentDraft() }
function syncTabOrientation() { verticalTabs.value = window.innerWidth > 700 }
onMounted(async () => { window.addEventListener('resize', syncTabOrientation); try { await teamsStore.loadTeams(); user.value = (await api.getMe()).data; if (user.value?.role === 'admin') await reload() } catch (e) { error.value = e.message || '暂时无法加载管理后台' } finally { loading.value = false } })
onBeforeUnmount(() => { window.removeEventListener('resize', syncTabOrientation); document.body.classList.remove('modal-open') })
async function run(action, success, onFailure) { busy.value = true; error.value = ''; try { await action(); message.value = success; await reload(); return true } catch (e) { onFailure?.(e); error.value = e.message || '操作失败'; return false } finally { busy.value = false } }
function review(entry, status) { run(() => api.reviewApplication(entry.id, status), '审核结果已保存。') }
function toggleMember(member) { run(() => api.setMemberActive(member.id, !member.is_active), member.is_active ? '账号已停用。' : '账号已恢复。') }
function revokeMembership(membership) { if (window.confirm(`确认撤销${membership.name}的${teamName(membership.team)}关系吗？`)) run(() => api.revokeMembership(membership.id), '团队关系已撤销。') }
function restoreMembership(membership) { run(() => api.restoreMembership(membership.id), '团队关系已恢复。') }
function editTeam(team) { Object.assign(teamDraft, { ...team, learnText: (team.learn || []).join('\n') }) }
function teamPayload() { return { name: teamDraft.name, caption: teamDraft.caption, image: teamDraft.image, intro: teamDraft.intro, learn: lines(teamDraft.learnText), practice: teamDraft.practice, sort_order: Number(teamDraft.sort_order), enabled: Boolean(teamDraft.enabled) } }
async function saveTeam() { if (!teamDraft.id) return; await run(() => api.updateTeam(teamDraft.id, teamPayload()), '团队内容已保存。') }
function resetPassword(member, event) {
  resetTarget.value = member
  resetTrigger.value = event?.currentTarget || null
  resetPasswordValue.value = ''
  resetPasswordConfirmation.value = ''
  resetDialogError.value = ''
  document.body.classList.add('modal-open')
  nextTick(() => resetPasswordInput.value?.focus())
}
function closeResetDialog() {
  if (busy.value) return
  resetTarget.value = null
  document.body.classList.remove('modal-open')
  resetPasswordValue.value = ''
  resetPasswordConfirmation.value = ''
  resetDialogError.value = ''
  nextTick(() => resetTrigger.value?.focus?.())
}
function handleResetDialogKeydown(event) { handleDialogKeydown(event, closeResetDialog) }
async function submitResetPassword() {
  resetDialogError.value = ''
  if (resetPasswordValue.value !== resetPasswordConfirmation.value) {
    resetDialogError.value = '两次输入的临时密码不一致。'
    nextTick(() => resetConfirmationInput.value?.focus())
    return
  }
  if (resetPasswordValue.value.length < 10) {
    resetDialogError.value = '临时密码至少需要 10 位。'
    nextTick(() => resetPasswordInput.value?.focus())
    return
  }
  if (await run(() => api.resetMemberPassword(resetTarget.value.id, resetPasswordValue.value), '临时密码已设置，账号已激活。')) closeResetDialog()
}
function startNewResource() { Object.assign(draft, { id: '', team: 'software', visibility: 'public', status: 'draft', retryUpload: false, retryTargetStatus: '', title: '', summary: '', body: '', file: null, existingFile: null }); uploadProgress.value = null }
function editResource(item) { Object.assign(draft, { ...item, retryUpload: false, retryTargetStatus: '', file: null, existingFile: item.file ? item : null }); api.readResource(item.id).then(result => { draft.body = result.data.body; draft.existingFile = result.data.file ? result.data : null }).catch(e => { error.value = e.message || '无法读取资源正文' }) }
function selectFile(event) {
  const file = event.target.files?.[0] || null
  if (file && file.size > 30 * 1024 * 1024) {
    error.value = '附件不能超过 30 MiB。'
    event.target.value = ''
    draft.file = null
    return
  }
  error.value = ''
  draft.file = file
}
function formatBytes(size) {
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KiB`
  return `${(size / 1024 / 1024).toFixed(1)} MiB`
}
function formatDate(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN') }
async function saveResource() {
  const wasEditing = Boolean(draft.id)
  const retryUpload = draft.retryUpload
  const targetStatus = draft.retryTargetStatus || draft.status
  uploadProgress.value = draft.file ? 0 : null
  const successMessage = wasEditing && !retryUpload
    ? '资源已更新。'
    : targetStatus === 'published'
      ? '资源已发布。'
      : targetStatus === 'offline'
        ? '下线资源已保存。'
        : '资源草稿已保存。'
  const save = async () => {
    const payload = retryUpload ? { ...draft, status: 'draft' } : draft
    const result = wasEditing
      ? await api.updateResource(draft.id, payload, value => { uploadProgress.value = value })
      : await api.publishResource(payload, value => { uploadProgress.value = value }, id => { draft.id = id })
    if (retryUpload && targetStatus !== 'draft') await api.setResourceStatus(draft.id, targetStatus)
    return result
  }
  if (await run(save, successMessage, failure => {
    if (!wasEditing && failure.resourceId) {
      draft.id = failure.resourceId
      draft.retryUpload = true
      draft.retryTargetStatus = targetStatus
      draft.status = 'draft'
      message.value = `资源草稿已保留，附件上传失败。重试成功后会恢复为“${resourceStatusText[targetStatus]}”，不会重复创建。`
    }
  })) startNewResource()
}
async function removeResourceAttachment() { if (!draft.id || !window.confirm('确认移除当前附件吗？')) return; await run(() => api.removeResourceFile(draft.id), '附件已移除。'); draft.existingFile = null }
function changeResourceStatus(item, status) {
  if (status === 'offline' && !window.confirm(`确认下线“${item.title}”吗？`)) return
  const successMessage = { draft: '资源已转为草稿。', published: '资源已发布。', offline: '资源已下线。' }[status]
  run(() => api.setResourceStatus(item.id, status), successMessage)
}
function lines(value) { return String(value || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean) }
function assetLines(value) { return lines(value).map(item => { const [label, ...rest] = item.split('|'); const path = rest.join('|').trim(); return path ? { label: label.trim() || path, path } : item }) }
function assetText(value) { return (value || []).map(item => typeof item === 'string' ? item : `${item.label || ''} | ${item.path || ''}`).join('\n') }
function startNewProject() { Object.assign(projectDraft, { id: '', legacy_id: '', edition: 'custom', slug: '', group: '', category: 'software', categoryLabel: '软件系统', title: '', subtitle: '', summary: '', members: '', accent: 'cyan', sort_order: 0, status: 'published', tagsText: '', highlightsText: '', outcomesText: '', techText: '', mediaText: '', videosText: '', filesText: '' }); projectAssets.value = []; resetProjectAsset() }
async function editProject(item) { Object.assign(projectDraft, { ...item, tagsText: item.tags.join('\n'), highlightsText: item.highlights.join('\n'), outcomesText: item.outcomes.join('\n'), techText: item.tech.join('\n'), mediaText: assetText(item.media), videosText: assetText(item.videos), filesText: assetText(item.files) }); resetProjectAsset(); await loadProjectAssets(item.id) }
function projectPayloadFromDraft() { return { ...projectDraft, tags: lines(projectDraft.tagsText), highlights: lines(projectDraft.highlightsText), outcomes: lines(projectDraft.outcomesText), tech: lines(projectDraft.techText), media: assetLines(projectDraft.mediaText), videos: assetLines(projectDraft.videosText), files: assetLines(projectDraft.filesText) } }
async function saveProject() { if (await run(() => projectDraft.id ? api.updateProject(projectDraft.id, projectPayloadFromDraft()) : api.createProject(projectPayloadFromDraft()), projectDraft.id ? '项目已更新。' : '项目已发布。')) startNewProject() }
function removeProject(item) { if (window.confirm(`确认下线“${item.title}”吗？`)) run(() => api.offlineProject(item.id), '项目已下线。') }
function startNewAnnouncement() { Object.assign(announcementDraft, { id: '', slug: '', title: '', summary: '', body: '', kind: 'notice', status: 'draft', pinned: false, sort_order: 0 }) }
function editAnnouncement(item) { Object.assign(announcementDraft, item) }
async function saveAnnouncement() { if (await run(() => announcementDraft.id ? api.updateAnnouncement(announcementDraft.id, announcementDraft) : api.createAnnouncement(announcementDraft), announcementDraft.id ? '公告已更新。' : '公告已创建。')) startNewAnnouncement() }
function removeAnnouncement(item) { if (window.confirm(`确认下线“${item.title}”吗？`)) run(() => api.offlineAnnouncement(item.id), '公告已下线。') }
async function loadProjectAssets(projectRef) { if (!projectRef || typeof api.listAdminProjectAssets !== 'function') return; try { projectAssets.value = (await api.listAdminProjectAssets(projectRef)).data || [] } catch (e) { error.value = e.message || '无法加载项目素材' } }
function resetProjectAsset() { Object.assign(assetDraft, { id: '', kind: 'image', label: '', source_type: 'legacy', availability: 'missing', legacy_path: '', sort_order: 0, published: false, file: null }) }
function editProjectAsset(asset) { Object.assign(assetDraft, { ...asset, file: null, published: Boolean(asset.published) }) }
function selectProjectAssetFile(event) { const file = event.target.files?.[0] || null; if (file && file.size > 30 * 1024 * 1024) { error.value = '项目素材不能超过 30 MiB。'; event.target.value = ''; assetDraft.file = null; return }; error.value = ''; assetDraft.file = file; if (file) { assetDraft.source_type = 'upload'; assetDraft.availability = 'available' } }
function projectAssetStatusText(asset) { if (asset.availability === 'offline') return '已下线'; if (asset.availability === 'missing') return '待补充'; return asset.published ? '已发布' : '未发布' }
async function saveProjectAsset() { if (!projectDraft.id) return; uploadProgress.value = assetDraft.file ? 0 : null; if (await run(async () => { const payload = { ...assetDraft, published: assetDraft.file ? false : Boolean(assetDraft.published) }; if (assetDraft.id) { if (assetDraft.file) await api.uploadProjectAssetFile(assetDraft.id, assetDraft.file, value => { uploadProgress.value = value }); await api.updateProjectAsset(assetDraft.id, payload) } else await api.createProjectAsset(projectDraft.id, payload, value => { uploadProgress.value = value }) }, assetDraft.id ? '项目素材已更新。' : '项目素材已添加。')) { resetProjectAsset(); uploadProgress.value = null } }
function removeProjectAsset(asset) { if (window.confirm(`确认下线“${asset.label}”吗？`)) run(() => api.offlineProjectAsset(asset.id), '项目素材已下线。') }
function loadContentDraft() { contentDraft.value = JSON.stringify(siteContent.value?.[contentSection.value] || {}, null, 2) }
async function saveContent() {
  let value
  try { value = JSON.parse(contentDraft.value) } catch { error.value = '官网内容必须是有效 JSON。'; return }
  await run(async () => { await api.updateSiteSection(contentSection.value, value); await siteStore.loadSite(true) }, '官网内容已保存。')
}
async function signOut() { await api.logout(); await router.replace('/portal') }
</script>
