onRecordAuthRequest((e) => {
  if (!e.record.getBool("is_active")) throw new ForbiddenError("账号已停用");
  return e.next();
}, "users");

// The collection view rule must allow an authenticated request to reach a
// Protected file. Hide team content from direct record reads; the controlled
// resource route is the only record-read path for team content.
onRecordViewRequest((e) => {
  const record = e.record;
  const resource = e.app.findRecordById("resources", record.getString("resource"));
  const auth = e.requestInfo().auth;
  const isSuperuser = e.requestInfo().hasSuperuserAuth();
  const isAdmin = Boolean(auth && auth.collection().name === "users" && auth.getBool("is_active") && auth.getString("role") === "admin");
  if (isSuperuser || isAdmin || (resource.getString("status") === "published" && resource.getString("visibility") === "public")) return e.next();
  throw new NotFoundError("资源不存在");
}, "resource_contents");

// Direct `/api/files/...` requests do not evaluate collection rules. Apply the
// same publication and membership checks here for both public and protected
// resource attachments.
onFileDownloadRequest((e) => {
  const lab = require(__hooks + "/lab.js");
  const requestInfo = e.requestInfo();
  let auth = requestInfo.auth;
  if (!auth && requestInfo.query && requestInfo.query.token) {
    try { auth = e.app.findAuthRecordByToken(requestInfo.query.token, "file"); } catch (_) {}
  }
  const isSuperuser = e.requestInfo().hasSuperuserAuth();
  const isAdmin = Boolean(auth && auth.collection().name === "users" && auth.getBool("is_active") && auth.getString("role") === "admin");
  if (isSuperuser || isAdmin) return e.next();
  const record = e.record;
  const project = e.app.findRecordById("projects", record.getString("project"));
  if (!record.getBool("published") || record.getString("availability") !== "available" || project.getString("status") !== "published") throw new NotFoundError("文件不存在");
  return e.next();
}, "project_assets");

onFileDownloadRequest((e) => {
  const lab = require(__hooks + "/lab.js");
  const requestInfo = e.requestInfo();
  let auth = requestInfo.auth;
  if (!auth && requestInfo.query && requestInfo.query.token) {
    try { auth = e.app.findAuthRecordByToken(requestInfo.query.token, "file"); } catch (_) {}
  }
  const isSuperuser = e.requestInfo().hasSuperuserAuth();
  const isAdmin = Boolean(auth && auth.collection().name === "users" && auth.getBool("is_active") && auth.getString("role") === "admin");
  if (isSuperuser || isAdmin) return e.next();
  const content = e.record;
  const resource = e.app.findRecordById("resources", content.getString("resource"));
  if (resource.getString("status") !== "published") throw new NotFoundError("文件不存在");
  if (resource.getString("visibility") === "public") return e.next();
  if (resource.getString("visibility") === "team" && auth && auth.collection().name === "users" && auth.getBool("is_active") &&
      lab.hasApprovedMembership(e.app, auth, resource.getString("team"))) return e.next();
  throw new NotFoundError("文件不存在");
}, "resource_contents");

// Builtin record mutation stays locked. Only these whitelisted routes write users.
routerAdd("POST", "/api/lab/members/{id}/active", (e) => {
  const lab = require(__hooks + "/lab.js");
  const body = e.requestInfo().body;
  lab.only(body, ["is_active"]);
  if (typeof body.is_active !== "boolean") throw new BadRequestError("状态必须为布尔值");
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const user = app.findRecordById("users", e.request.pathValue("id"));
    if (user.getString("role") !== "member") throw new ForbiddenError("此入口仅管理学生账号");
    const before = user.getBool("is_active");
    user.set("is_active", body.is_active);
    user.refreshTokenKey();
    app.save(user);
    lab.audit(app, actor.id, "member.active", "users", user.id, { from: before, to: body.is_active });
  });
  return e.json(200, { is_active: body.is_active });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/members/{id}/reset-password", (e) => {
  const lab = require(__hooks + "/lab.js");
  const body = e.requestInfo().body;
  lab.only(body, ["password"]);
  if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128) {
    throw new BadRequestError("临时密码须为 10–128 位");
  }
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const user = app.findRecordById("users", e.request.pathValue("id"));
    if (user.getString("role") !== "member") throw new ForbiddenError("此入口仅用于学生账号");
    user.setPassword(body.password);
    user.set("is_active", true);
    user.refreshTokenKey();
    app.save(user);
    lab.audit(app, actor.id, "member.password_reset", "users", user.id, { activated: true });
  });
  return e.json(200, { reauthenticate: true, activated: true });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/password", (e) => {
  const lab = require(__hooks + "/lab.js");
  const body = e.requestInfo().body;
  lab.only(body, ["old_password", "password"]);
  if (typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128) {
    throw new BadRequestError("新密码须为 10–128 位");
  }
  e.app.runInTransaction((app) => {
    const user = lab.activeUser(app, e.auth, false);
    if (typeof body.old_password !== "string" || !user.validatePassword(body.old_password)) {
      throw new BadRequestError("原密码不正确");
    }
    user.setPassword(body.password);
    user.refreshTokenKey();
    app.save(user);
    lab.audit(app, user.id, "member.password", "users", user.id, {});
  });
  return e.json(200, { reauthenticate: true });
}, $apis.requireAuth("users"));
