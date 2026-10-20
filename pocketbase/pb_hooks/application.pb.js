routerAdd("POST", "/api/lab/apply", (e) => {
  const lab = require(__hooks + "/lab.js");
  const body = e.requestInfo().body;
  lab.only(body, ["name", "student_id", "username", "team", "statement", "password"]);
  const name = String(body.name || "").trim();
  const studentId = String(body.student_id || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const statement = String(body.statement || "").trim();
  if (!name || name.length > 80 || !/^[0-9]{11}$/.test(studentId) ||
      (username && !/^[a-z][a-z0-9_.-]{2,29}$/.test(username)) ||
      typeof body.password !== "string" || body.password.length < 10 || body.password.length > 128 ||
      statement.length > 3000) throw new BadRequestError("请检查姓名、学号、用户名、说明和密码");
  let result;
  e.app.runInTransaction((app) => {
    const team = app.findFirstRecordByFilter("teams", 'code = {:code} && enabled = true', { code: String(body.team || "") });
    if (!team) throw new BadRequestError("团队不存在或已停用");
    const user = new Record(app.findCollectionByNameOrId("users"));
    user.load({ name, student_id: studentId, username, grade: studentId.slice(0, 2) + "级",
      primary_team: team.id, status: "pending", role: "member", is_active: true });
    user.setPassword(body.password);
    app.save(user);
    const application = new Record(app.findCollectionByNameOrId("applications"));
    application.load({ user: user.id, team: team.id, statement, status: "pending" });
    app.save(application);
    lab.ensureMembership(app, user, team.id, "pending", null);
    app.save(user);
    lab.audit(app, user.id, "application.submit", "applications", application.id, { status: "pending" });
    result = { id: application.id, status: "pending" };
  });
  return e.json(201, result);
});

routerAdd("POST", "/api/lab/applications/{id}/review", (e) => {
  const lab = require(__hooks + "/lab.js");
  const body = e.requestInfo().body;
  lab.only(body, ["status", "note"]);
  if (["approved", "rejected"].indexOf(body.status) === -1 || String(body.note || "").length > 1000) {
    throw new BadRequestError("审核状态或说明无效");
  }
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const application = app.findRecordById("applications", e.request.pathValue("id"));
    if (application.getString("status") !== "pending") throw new BadRequestError("该申请已处理");
    const user = app.findRecordById("users", application.getString("user"));
    const team = app.findRecordById("teams", application.getString("team"));
    if (!team.getBool("enabled") || user.getString("role") !== "member") throw new BadRequestError("无法审核该申请");
    application.load({ status: body.status, reviewed_by: actor.id,
      reviewed_at: new Date().toISOString(), review_note: String(body.note || "") });
    lab.ensureMembership(app, user, team.id, body.status, actor.id);
    lab.syncUserStatus(app, user);
    user.set("primary_team", user.getString("primary_team") || team.id);
    user.refreshTokenKey();
    app.save(user);
    app.save(application);
    lab.audit(app, actor.id, "application.review", "applications", application.id,
      { from: "pending", to: body.status });
  });
  return e.json(200, { status: body.status });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/apply-team", (e) => {
  const lab = require(__hooks + "/lab.js");
  const body = e.requestInfo().body || {};
  lab.only(body, ["team", "statement"]);
  let result;
  e.app.runInTransaction((app) => {
    const user = lab.activeUser(app, e.auth, false);
    if (user.getString("role") !== "member") throw new BadRequestError("管理员无需申请团队");
    const team = app.findFirstRecordByFilter("teams", "(id = {:team} || code = {:team}) && enabled = true", { team: String(body.team || "") });
    const statement = String(body.statement || "").trim();
    if (!team || statement.length > 1000) throw new BadRequestError("团队或申请说明无效");
    let existing = null;
    try { existing = app.findFirstRecordByFilter("team_memberships", "user = {:user} && team = {:team}", { user: user.id, team: team.id }); } catch (_) {}
    if (existing && existing.getBool("is_active") && ["pending", "approved"].indexOf(existing.getString("status")) >= 0) {
      throw new BadRequestError("该团队申请已存在");
    }
    const application = new Record(app.findCollectionByNameOrId("applications"));
    application.load({ user: user.id, team: team.id, statement, status: "pending" });
    app.save(application);
    lab.ensureMembership(app, user, team.id, "pending", null);
    lab.syncUserStatus(app, user);
    lab.audit(app, user.id, "membership.apply", "team_memberships", team.id, { status: "pending" });
    result = { id: application.id, team: team.getString("code"), status: "pending" };
  });
  return e.json(201, result);
}, $apis.requireAuth("users"));
