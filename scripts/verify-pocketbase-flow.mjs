import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

let base = ''
let superToken = ''

function password(label) { return `${label}-${randomBytes(18).toString('base64url')}` }
function delay(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)) }

async function request(pathname, options = {}, token = '') {
  const response = await fetch(`${base}/api${pathname}`, {
    ...options,
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  })
  const text = await response.text()
  let payload = {}
  try { payload = text ? JSON.parse(text) : {} } catch { payload = {} }
  return { status: response.status, payload }
}

async function expectStatus(result, status, label) {
  if (result.status !== status) throw new Error(`${label} returned ${result.status}`)
  return result
}

async function expectStatusOneOf(result, statuses, label) {
  if (!statuses.includes(result.status)) throw new Error(`${label} returned ${result.status}`)
  return result
}

async function createBusinessAdmin(teamId) {
  const stamp = String(Date.now()).slice(-9)
  const identity = `29${stamp}`
  const secret = password('FlowAdmin')
  const created = await request('/collections/users/records', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `flow-admin-${stamp}@example.invalid`, password: secret, passwordConfirm: secret, name: 'Flow Admin', student_id: identity, username: `flowadmin${stamp}`, grade: '29级', primary_team: teamId, status: 'approved', role: 'admin', is_active: true }),
  }, superToken)
  await expectStatus(created, 200, 'business admin creation')
  const auth = await request('/collections/users/auth-with-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity, password: secret }) })
  await expectStatus(auth, 200, 'business admin login')
  return { id: created.payload.id, token: auth.payload.token }
}

async function applyStudent(studentId, username, team, secret) {
  const result = await request('/lab/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Flow ${username}`, student_id: studentId, username, team, statement: 'fixture', password: secret }) })
  await expectStatus(result, 201, `apply ${team}`)
  return result.payload.id
}

async function login(identity, secret) {
  const result = await request('/collections/users/auth-with-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity, password: secret }) })
  await expectStatus(result, 200, `login ${identity}`)
  return { token: result.payload.token, record: result.payload.record }
}

async function upload(resourceId, token, filename = 'flow-fixture.pdf', bytes = Buffer.from('%PDF-1.4\n')) {
  const form = new FormData()
  form.set('resource', resourceId); form.set('body', 'Protected fixture body'); form.set('filename', filename); form.set('size', String(bytes.length))
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename)
  return request(`/lab/resources/${encodeURIComponent(resourceId)}/file`, { method: 'POST', body: form }, token)
}

export async function verifyFlow(options = {}) {
  base = String(options.base ?? process.env.POCKETBASE_URL ?? '').replace(/\/+$/, '')
  superToken = String(options.superToken ?? process.env.POCKETBASE_ADMIN_TOKEN ?? '')
  if (!base || !superToken) throw new Error('POCKETBASE_URL and POCKETBASE_ADMIN_TOKEN are required')
  const softwareResult = await request('/collections/teams/records?filter=code%20%3D%20%22software%22&perPage=1', {}, superToken)
  const hardwareResult = await request('/collections/teams/records?filter=code%20%3D%20%22hardware%22&perPage=1', {}, superToken)
  await expectStatus(softwareResult, 200, 'software lookup'); await expectStatus(hardwareResult, 200, 'hardware lookup')
  const software = softwareResult.payload.items?.[0], hardware = hardwareResult.payload.items?.[0]
  if (!software?.id || !hardware?.id) throw new Error('required teams are missing')

  const admin = await createBusinessAdmin(software.id)
  const stamp = String(Date.now()).slice(-9)
  const studentA = { id: `28${stamp}`, username: `flowa${stamp.slice(-6)}`, secret: password('FlowA') }
  const studentB = { id: `27${String(Number(stamp) + 1).slice(-9)}`, username: `flowb${stamp.slice(-6)}`, secret: password('FlowB') }
  const studentC = { id: `26${String(Number(stamp) + 2).slice(-9)}`, username: `flowc${stamp.slice(-6)}`, secret: password('FlowC') }
  const applicationA = await applyStudent(studentA.id, studentA.username, 'software', studentA.secret)
  const applicationB = await applyStudent(studentB.id, studentB.username, 'hardware', studentB.secret)
  const applicationC = await applyStudent(studentC.id, studentC.username, 'software', studentC.secret)
  const applications = await request('/collections/applications/records?perPage=200&expand=user,team', {}, admin.token)
  await expectStatus(applications, 200, 'application list')
  const findApplication = (studentId, fallback) => applications.payload.items?.find(item => item.expand?.user?.student_id === studentId)?.id || fallback
  const review = async (studentId, fallback) => request(`/lab/applications/${encodeURIComponent(findApplication(studentId, fallback))}/review`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) }, admin.token)
  const reviewA = await review(studentA.id, applicationA), reviewB = await review(studentB.id, applicationB)
  await expectStatus(reviewA, 200, 'software review'); await expectStatus(reviewB, 200, 'hardware review')
  const duplicateReview = await review(studentA.id, applicationA); await expectStatus(duplicateReview, 400, 'duplicate review rejection')

  let memberA = await login(studentA.id, studentA.secret), memberB = await login(studentB.id, studentB.secret), pendingMember = await login(studentC.id, studentC.secret)
  const memberReview = await request(`/lab/applications/${encodeURIComponent(findApplication(studentC.id, applicationC))}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  }, memberA.token)
  await expectStatus(memberReview, 403, 'member review rejection')
  const pendingAfterMemberReview = await request(`/collections/applications/records/${encodeURIComponent(findApplication(studentC.id, applicationC))}`, {}, admin.token)
  await expectStatus(pendingAfterMemberReview, 200, 'pending application lookup')
  if (pendingAfterMemberReview.payload.status !== 'pending') throw new Error('member review request changed pending application')
  const memberRoleWrite = await request(`/collections/users/records/${encodeURIComponent(memberA.record.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  }, memberA.token)
  await expectStatus(memberRoleWrite, 403, 'member role write rejection')
  const memberAfterRoleWrite = await request(`/collections/users/records/${encodeURIComponent(memberA.record.id)}`, {}, admin.token)
  await expectStatus(memberAfterRoleWrite, 200, 'member role lookup')
  if (memberAfterRoleWrite.payload.role !== 'member') throw new Error('member role changed through direct collection write')

  const secondTeamApplication = await request('/lab/apply-team', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team: hardware.id, statement: 'second team fixture' }),
  }, memberA.token)
  await expectStatus(secondTeamApplication, 201, 'second-team application')
  const secondTeamReview = await request(`/lab/applications/${encodeURIComponent(secondTeamApplication.payload.id)}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'approved' }),
  }, admin.token)
  await expectStatus(secondTeamReview, 200, 'second-team review')
  memberA = await login(studentA.id, studentA.secret)
  const memberRecord = await request(`/collections/users/records/${encodeURIComponent(memberA.record.id)}?expand=primary_team,memberships,memberships.team`, {}, memberA.token)
  await expectStatus(memberRecord, 200, 'member team membership expansion')
  const memberTeams = (memberRecord.payload.expand?.memberships || [])
    .filter(item => item.status === 'approved' && item.is_active)
    .map(item => item.expand?.team?.code || '')
  for (const code of ['software', 'hardware']) {
    if (!memberTeams.includes(code)) throw new Error(`member membership expansion omitted approved ${code} team`)
  }
  const ownMembershipList = await request('/collections/team_memberships/records?perPage=200', {}, memberA.token)
  await expectStatus(ownMembershipList, 200, 'member own membership list')
  if (!ownMembershipList.payload.items?.length || ownMembershipList.payload.items.some(item => item.user !== memberA.record.id)) {
    throw new Error('member membership list included another user or omitted the member records')
  }
  const otherMembershipList = await request(`/collections/team_memberships/records?perPage=200&filter=user%20%3D%20%22${encodeURIComponent(memberB.record.id)}%22`, {}, memberA.token)
  await expectStatus(otherMembershipList, 200, 'cross-member membership list')
  if ((otherMembershipList.payload.totalItems || 0) !== 0) throw new Error('member read another user membership records')

  const pbDataAnonymous = await fetch(`${base}/pb_data`)
  const pbDataMember = await fetch(`${base}/pb_data`, { headers: { Authorization: `Bearer ${memberA.token}` } })
  await expectStatusOneOf({ status: pbDataAnonymous.status }, [403, 404], 'anonymous pb_data path')
  await expectStatusOneOf({ status: pbDataMember.status }, [403, 404], 'member pb_data path')
  const resource = await request('/lab/resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ team: software.id, title: 'Flow protected resource', summary: 'Fixture summary', visibility: 'team', body: 'Protected fixture body', filename: 'flow-fixture.pdf', size: 0 }) }, admin.token)
  await expectStatus(resource, 201, 'resource create')
  const secondTeamResource = await request('/lab/resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ team: hardware.id, title: 'Flow second-team resource', summary: 'Second-team fixture', visibility: 'team', body: 'Second-team protected body', filename: '', size: 0 }) }, admin.token)
  await expectStatus(secondTeamResource, 201, 'second-team resource create')
  const secondTeamRead = await request(`/lab/resources/${encodeURIComponent(secondTeamResource.payload.resource.id)}`, {}, memberA.token)
  await expectStatus(secondTeamRead, 200, 'second-team controlled resource read')
  if (secondTeamRead.payload.content?.body !== 'Second-team protected body') throw new Error('controlled resource read returned the wrong body')
  const secondTeamContent = await request(`/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(secondTeamResource.payload.resource.id)}%22&perPage=1`, {}, memberA.token)
  await expectStatus(secondTeamContent, 200, 'second-team content lookup')
  if ((secondTeamContent.payload.totalItems || 0) !== 0) throw new Error('team content was exposed through the standard collection endpoint')
  const memberships = await request('/lab/admin/memberships', {}, admin.token)
  await expectStatus(memberships, 200, 'membership list')
  const secondMembership = memberships.payload.data?.find(item => item.user_id === memberA.record.id && item.team === 'hardware')
  if (!secondMembership?.id) throw new Error('second-team membership was not listed')
  const otherMembership = memberships.payload.data?.find(item => item.user_id === memberB.record.id && item.team === 'hardware')
  if (!otherMembership?.id) throw new Error('other-member fixture membership was not listed')
  const foreignMembership = await request(`/collections/team_memberships/records/${encodeURIComponent(otherMembership.id)}`, {}, memberA.token)
  await expectStatus(foreignMembership, 404, 'cross-member membership detail rejection')
  const revokeSecondMembership = await request(`/lab/admin/memberships/${encodeURIComponent(secondMembership.id)}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, admin.token)
  await expectStatus(revokeSecondMembership, 200, 'second-team membership revoke')
  const revokedSecondTeamRead = await request(`/lab/resources/${encodeURIComponent(secondTeamResource.payload.resource.id)}`, {}, memberA.token)
  await expectStatus(revokedSecondTeamRead, 404, 'revoked second-team controlled resource read')
  const revokedSecondTeamContent = await request(`/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(secondTeamResource.payload.resource.id)}%22&perPage=1`, {}, memberA.token)
  await expectStatus(revokedSecondTeamContent, 200, 'revoked second-team content lookup')
  if ((revokedSecondTeamContent.payload.totalItems || 0) !== 0) throw new Error('revoked second-team membership still reads matching content')
  const adminResource = await request('/lab/resources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ team: software.id, title: 'Flow administrator resource', summary: 'Administrator-only fixture', visibility: 'admin', body: 'Administrator fixture body', filename: '', size: 0 }) }, admin.token)
  await expectStatus(adminResource, 201, 'administrator resource create')
  const publicResources = await request('/collections/resources/records?perPage=200', {})
  await expectStatus(publicResources, 200, 'public resource list')
  if (publicResources.payload.items?.some(item => item.title === 'Flow administrator resource')) throw new Error('administrator-only resource was publicly listed')
  const adminResources = await request('/collections/resources/records?perPage=200', {}, admin.token)
  await expectStatus(adminResources, 200, 'administrator resource list')
  if (!adminResources.payload.items?.some(item => item.title === 'Flow administrator resource')) throw new Error('administrator-only resource was hidden from admin')

  const lifecycle = await request('/lab/resources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team: software.id, title: 'Flow resource lifecycle', summary: 'Draft, published and offline fixture', visibility: 'public', status: 'draft', body: 'Lifecycle fixture body', filename: '', size: 0 }),
  }, admin.token)
  await expectStatus(lifecycle, 201, 'draft resource create')
  const lifecycleId = lifecycle.payload.resource?.id
  if (!lifecycleId || lifecycle.payload.resource.status !== 'draft') throw new Error('draft resource status was not preserved')
  const lifecycleUpload = await upload(lifecycleId, admin.token, 'lifecycle-fixture.pdf', Buffer.from('%PDF-1.4 lifecycle\n'))
  await expectStatus(lifecycleUpload, 200, 'draft resource file upload')
  const draftList = await request('/collections/resources/records?perPage=200')
  await expectStatus(draftList, 200, 'public list with draft resource')
  if (draftList.payload.items?.some(item => item.id === lifecycleId)) throw new Error('draft resource appeared in the public list')
  const draftRead = await request(`/lab/resources/${encodeURIComponent(lifecycleId)}`)
  await expectStatus(draftRead, 404, 'draft resource body rejection')
  const lifecycleContent = await request(`/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(lifecycleId)}%22&perPage=1`, {}, admin.token)
  await expectStatus(lifecycleContent, 200, 'draft resource content lookup')
  const lifecycleRecord = lifecycleContent.payload.items?.[0]
  if (!lifecycleRecord?.id || !lifecycleRecord.file) throw new Error('draft resource attachment was not stored')
  const lifecycleFileUrl = `${base}/api/files/resource_contents/${encodeURIComponent(lifecycleRecord.id)}/${encodeURIComponent(lifecycleRecord.file)}`
  const draftFile = await fetch(lifecycleFileUrl)
  await expectStatus({ status: draftFile.status }, 404, 'draft direct file download rejection')
  const lifecyclePublish = await request(`/lab/resources/${encodeURIComponent(lifecycleId)}/status`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'published' }),
  }, admin.token)
  await expectStatus(lifecyclePublish, 200, 'draft resource publication')
  if (lifecyclePublish.payload.status !== 'published') throw new Error('resource publication status was not preserved')
  const publishedList = await request('/collections/resources/records?perPage=200')
  await expectStatus(publishedList, 200, 'public list with published resource')
  if (!publishedList.payload.items?.some(item => item.id === lifecycleId)) throw new Error('published resource was missing from the public list')
  const publishedRead = await request(`/lab/resources/${encodeURIComponent(lifecycleId)}`)
  await expectStatus(publishedRead, 200, 'published resource body read')
  const publishedFile = await fetch(lifecycleFileUrl)
  await expectStatus({ status: publishedFile.status }, 200, 'published direct file download')
  const lifecycleOffline = await request(`/lab/resources/${encodeURIComponent(lifecycleId)}/status`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'offline' }),
  }, admin.token)
  await expectStatus(lifecycleOffline, 200, 'published resource offline transition')
  if (lifecycleOffline.payload.status !== 'offline') throw new Error('resource offline status was not preserved')
  const offlineList = await request('/collections/resources/records?perPage=200')
  await expectStatus(offlineList, 200, 'public list with offline resource')
  if (offlineList.payload.items?.some(item => item.id === lifecycleId)) throw new Error('offline resource appeared in the public list')
  const offlineRead = await request(`/lab/resources/${encodeURIComponent(lifecycleId)}`)
  await expectStatus(offlineRead, 404, 'offline resource body rejection')
  const offlineFile = await fetch(lifecycleFileUrl)
  await expectStatus({ status: offlineFile.status }, 404, 'offline direct file download rejection')

  const resourceId = resource.payload.resource.id, fileUpload = await upload(resourceId, admin.token); await expectStatus(fileUpload, 200, 'protected file upload')
  const content = await request(`/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(resourceId)}%22&perPage=1`, {}, admin.token)
  await expectStatus(content, 200, 'administrator content lookup')
  let contentRecord = content.payload.items?.[0]; if (!contentRecord?.id || !contentRecord.file) throw new Error('protected content record missing file')
  const directMemberContent = await request('/collections/resource_contents/records/' + encodeURIComponent(contentRecord.id), {}, memberA.token)
  await expectStatus(directMemberContent, 404, 'direct team content view rejection')
  const crossTeam = await request(`/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(resourceId)}%22&perPage=1`, {}, memberB.token)
  const pendingContent = await request(`/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(resourceId)}%22&perPage=1`, {}, pendingMember.token)
  const anonymous = await request(`/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(resourceId)}%22&perPage=1`)
  if (crossTeam.status !== 200 || (crossTeam.payload.totalItems || 0) !== 0) throw new Error('cross-team content was visible')
  if (pendingContent.status !== 200 || (pendingContent.payload.totalItems || 0) !== 0) throw new Error('pending content was visible')
  if (anonymous.status !== 200 || (anonymous.payload.totalItems || 0) !== 0) throw new Error('anonymous content was visible')
  const tokenResult = await request('/files/token', { method: 'POST', body: '{}' }, memberA.token); await expectStatus(tokenResult, 200, 'protected file token')
  const fileUrl = `${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}?token=${encodeURIComponent(tokenResult.payload.token)}`
  const fileResponse = await fetch(fileUrl); if (fileResponse.status !== 200) throw new Error(`protected file download returned ${fileResponse.status}`)
  const crossToken = await request('/files/token', { method: 'POST', body: '{}' }, memberB.token); await expectStatus(crossToken, 200, 'cross-team file token')
  const crossFile = await fetch(`${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}?token=${encodeURIComponent(crossToken.payload.token)}`)
  if (crossFile.status !== 404) throw new Error(`cross-team protected file download returned ${crossFile.status}`)
  const pendingToken = await request('/files/token', { method: 'POST', body: '{}' }, pendingMember.token); await expectStatus(pendingToken, 200, 'pending file token')
  const pendingFile = await fetch(`${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}?token=${encodeURIComponent(pendingToken.payload.token)}`)
  if (pendingFile.status !== 404) throw new Error(`pending protected file download returned ${pendingFile.status}`)
  const anonymousFile = await fetch(`${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}`); if (anonymousFile.status !== 404) throw new Error(`anonymous file download returned ${anonymousFile.status}`)
  const invalidFileToken = await fetch(`${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}?token=expired-fixture-token`)
  if (invalidFileToken.status !== 404) throw new Error(`invalid protected file token returned ${invalidFileToken.status}`)
  const replacement = await upload(resourceId, admin.token, 'flow-fixture-v2.pdf', Buffer.from('%PDF-1.4 replacement\n')); await expectStatus(replacement, 200, 'protected file replacement')
  const replacementContent = await request(`/collections/resource_contents/records?filter=resource%20%3D%20%22${encodeURIComponent(resourceId)}%22&perPage=1`, {}, admin.token)
  await expectStatus(replacementContent, 200, 'replacement content lookup')
  contentRecord = replacementContent.payload.items?.[0]
  if (!contentRecord?.file || contentRecord.file === 'flow-fixture.pdf') throw new Error('protected file replacement did not update filename')
  const replacementFileUrl = `${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}?token=${encodeURIComponent(tokenResult.payload.token)}`
  const replacementFile = await fetch(replacementFileUrl)
  if (replacementFile.status !== 200) throw new Error(`replacement protected file download returned ${replacementFile.status}`)

  const siteRecord = await request('/collections/site_pages/records?filter=key%20%3D%20%22site%22&perPage=1', {}, superToken)
  await expectStatus(siteRecord, 200, 'site content lookup')
  const home = siteRecord.payload.items?.[0]?.payload?.home
  if (!home?.hero?.title) throw new Error('seeded site home section is missing')
  const invalidSite = await request('/lab/site', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ section: 'home', value: {} }) }, admin.token)
  await expectStatus(invalidSite, 400, 'invalid site structure rejection')
  const invalidSiteLink = await request('/lab/site', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ section: 'home', value: { ...home, hero: { ...home.hero, image: 'javascript:alert(1)' } } }) }, admin.token)
  await expectStatus(invalidSiteLink, 400, 'unsafe site URL rejection')
  const site = await request('/lab/site', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ section: 'home', value: { ...home, hero: { ...home.hero, title: `${home.hero.title} flow` } } }) }, admin.token)
  await expectStatus(site, 200, 'site edit')
  const siteAfter = await request('/collections/site_pages/records?filter=key%20%3D%20%22site%22&perPage=1', {}, superToken)
  await expectStatus(siteAfter, 200, 'updated site content lookup')
  if (siteAfter.payload.items?.[0]?.payload?.home?.hero?.title !== `${home.hero.title} flow`) throw new Error('site edit was not persisted')
  const audit = await request('/collections/audit_logs/records?filter=action%20%3D%20%22site.update%22&perPage=1', {}, admin.token); await expectStatus(audit, 200, 'site audit lookup'); if (!audit.payload.items?.length) throw new Error('site edit audit missing')
  const announcementSlug = `flow-announcement-${stamp}`
  const announcement = await request('/lab/admin/announcements', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: announcementSlug, title: 'Flow announcement', summary: 'Isolated fixture', body: 'Published announcement body', kind: 'notice', status: 'published' }),
  }, admin.token)
  await expectStatus(announcement, 201, 'published announcement create')
  const publicAnnouncements = await request('/lab/announcements')
  await expectStatus(publicAnnouncements, 200, 'public announcement list')
  if (!publicAnnouncements.payload.data?.some(item => item.slug === announcementSlug)) throw new Error('published announcement was missing from the public list')
  const publicAnnouncement = await request(`/lab/announcements/${encodeURIComponent(announcementSlug)}`)
  await expectStatus(publicAnnouncement, 200, 'public announcement detail')
  if (publicAnnouncement.payload.data?.body !== 'Published announcement body') throw new Error('public announcement detail returned the wrong body')
  const directWrite = await request('/collections/resources/records', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ team: software.id, title: 'bypass', summary: 'bypass', visibility: 'public', status: 'published', created_by: admin.id }) }, admin.token); await expectStatus(directWrite, 403, 'direct resource write rejection')

  const changedPassword = password('ChangedStudentA')
  const passwordChange = await request('/lab/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ old_password: studentA.secret, password: changedPassword }),
  }, memberA.token)
  await expectStatus(passwordChange, 200, 'member password change')
  const preChangeSession = await request(`/collections/users/records/${encodeURIComponent(memberA.record.id)}`, {}, memberA.token)
  if (preChangeSession.status !== 404) throw new Error(`old session after password change returned ${preChangeSession.status}`)
  const preChangeFile = await fetch(replacementFileUrl)
  if (preChangeFile.status !== 404) throw new Error(`old protected file token after password change returned ${preChangeFile.status}`)

  studentA.secret = changedPassword
  memberA = await login(studentA.id, studentA.secret)
  const resetToken = await request('/files/token', { method: 'POST', body: '{}' }, memberA.token)
  await expectStatus(resetToken, 200, 'pre-reset protected file token')
  const resetFileUrl = `${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}?token=${encodeURIComponent(resetToken.payload.token)}`
  const resetPassword = password('ResetStudentA')
  const administratorReset = await request(`/lab/members/${encodeURIComponent(memberA.record.id)}/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: resetPassword }),
  }, admin.token)
  await expectStatus(administratorReset, 200, 'administrator password reset')
  const preResetSession = await request(`/collections/users/records/${encodeURIComponent(memberA.record.id)}`, {}, memberA.token)
  if (preResetSession.status !== 404) throw new Error(`old session after administrator reset returned ${preResetSession.status}`)
  const preResetFile = await fetch(resetFileUrl)
  if (preResetFile.status !== 404) throw new Error(`old protected file token after administrator reset returned ${preResetFile.status}`)
  studentA.secret = resetPassword
  memberA = await login(studentA.id, studentA.secret)
  const disabledToken = await request('/files/token', { method: 'POST', body: '{}' }, memberA.token)
  await expectStatus(disabledToken, 200, 'pre-disable protected file token')
  const disabledFileUrl = `${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}?token=${encodeURIComponent(disabledToken.payload.token)}`

  const disabled = await request(`/lab/members/${encodeURIComponent(memberA.record.id)}/active`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_active: false }) }, admin.token); await expectStatus(disabled, 200, 'member disable')
  const oldTokenView = await request(`/collections/users/records/${encodeURIComponent(memberA.record.id)}`, {}, memberA.token); if (oldTokenView.status !== 404) throw new Error(`disabled token returned ${oldTokenView.status}`)
  const oldFile = await fetch(disabledFileUrl); if (oldFile.status !== 404) throw new Error(`disabled member file token returned ${oldFile.status}`)
  const disabledLogin = await request('/collections/users/auth-with-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity: studentA.id, password: studentA.secret }) }); if (![400, 403].includes(disabledLogin.status)) throw new Error(`disabled login returned ${disabledLogin.status}`)
  let naturalFileTokenExpiry = null
  if (options.checkNaturalFileTokenExpiry === true) {
    const initialCollection = await request('/collections/users', {}, superToken)
    await expectStatus(initialCollection, 200, 'file-token migration lookup')
    const configuredDurationSeconds = Number(initialCollection.payload.fileToken?.duration)
    if (configuredDurationSeconds !== 120) throw new Error('users file-token migration did not set the 120-second application duration')
    const configureExpiry = await request('/collections/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileToken: { duration: 10 } }),
    }, superToken)
    await expectStatus(configureExpiry, 200, 'isolated file-token expiry configuration')
    const collection = await request('/collections/users', {}, superToken)
    await expectStatus(collection, 200, 'file-token expiry configuration lookup')
    const durationSeconds = Number(collection.payload.fileToken?.duration)
    if (durationSeconds !== 10) throw new Error('isolated file-token duration was not set to 10 seconds')
    const expiringToken = await request('/files/token', { method: 'POST', body: '{}' }, admin.token)
    await expectStatus(expiringToken, 200, 'natural-expiry protected file token')
    const claimsSegment = String(expiringToken.payload.token || '').split('.')[1]
    let claims = {}
    try { claims = JSON.parse(Buffer.from(claimsSegment, 'base64url').toString('utf8')) } catch {}
    const expiresAt = Number(claims.exp) * 1000
    const remainingMs = expiresAt - Date.now()
    if (!Number.isFinite(expiresAt) || remainingMs <= 0 || remainingMs > durationSeconds * 1000 + 2000) {
      throw new Error('natural-expiry protected file token has an unexpected expiration')
    }
    const expiringFileUrl = `${base}/api/files/resource_contents/${encodeURIComponent(contentRecord.id)}/${encodeURIComponent(contentRecord.file)}?token=${encodeURIComponent(expiringToken.payload.token)}`
    const beforeExpiry = await fetch(expiringFileUrl)
    await expectStatus({ status: beforeExpiry.status }, 200, 'protected file before natural token expiry')
    await delay(remainingMs + 1100)
    const afterExpiry = await fetch(expiringFileUrl)
    await expectStatus({ status: afterExpiry.status }, 404, 'protected file after natural token expiry')
    naturalFileTokenExpiry = { configuredDurationSeconds, testDurationSeconds: durationSeconds, beforeExpiry: beforeExpiry.status, afterExpiry: afterExpiry.status, expiredNaturally: true }
  }
  return {
    apply: 3,
    review: { approved: 2, duplicateRejected: true, pendingLogin: true, memberRejected: memberReview.status, pendingAfterMemberReview: pendingAfterMemberReview.payload.status },
    resource: { created: true, secondTeamRead: true, secondTeamRevoked: true, standardTeamContentHidden: true, directTeamContentHidden: true, adminOnlyHidden: true, fileUploaded: true, sameTeamRead: true, crossTeamItems: crossTeam.payload.totalItems || 0, pendingItems: pendingContent.payload.totalItems || 0, anonymousItems: anonymous.payload.totalItems || 0 },
    resourceLifecycle: { draftHidden: true, publishedVisible: true, offlineHidden: true, draftFile: draftFile.status, publishedFile: publishedFile.status, offlineFile: offlineFile.status },
    announcement: { publishedListed: true, publicDetail: true },
    file: { protectedDownload: fileResponse.status, replacementDownload: replacementFile.status, crossTeamDownload: crossFile.status, pendingDownload: pendingFile.status, anonymousDownload: anonymousFile.status, invalidTokenDownload: invalidFileToken.status, passwordChangeTokenDownload: preChangeFile.status, passwordResetTokenDownload: preResetFile.status, disabledTokenDownload: oldFile.status, naturalExpiry: naturalFileTokenExpiry },
    site: { updated: true, audited: true },
    permissions: {
      directResourceWrite: directWrite.status,
      memberRoleWrite: memberRoleWrite.status,
      memberRoleAfterWrite: memberAfterRoleWrite.payload.role,
      pbDataAnonymous: pbDataAnonymous.status,
      pbDataMember: pbDataMember.status,
      disabledToken: oldTokenView.status,
      disabledLogin: disabledLogin.status,
      passwordChangeSession: preChangeSession.status,
      passwordResetSession: preResetSession.status,
    },
    pass: true,
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = await verifyFlow(); process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.pass ? 0 : 1 } catch { process.stderr.write('PocketBase flow verification failed.\n'); process.exitCode = 2 }
}
