// CommonJS helper; import inside each hook callback (PocketBase isolates handlers).
module.exports = {
  activeUser(app, auth, adminOnly) {
    if (!auth || auth.collection().name !== "users") throw new ForbiddenError("需要实验室账号");
    const user = app.findRecordById("users", auth.id);
    if (!user.getBool("is_active") || (adminOnly && user.getString("role") !== "admin")) {
      throw new ForbiddenError("账号无权执行此操作");
    }
    return user;
  },
  ensureMembership(app, user, team, status, actor) {
    const collection = app.findCollectionByNameOrId("team_memberships");
    let record = null;
    try {
      record = app.findFirstRecordByFilter("team_memberships", "user = {:user} && team = {:team}", { user: user.id, team });
    } catch (_) {}
    const now = new Date().toISOString();
    if (!record) record = new Record(collection);
    const existingJoined = record.getString("joined_at");
    record.load({ user: user.id, team, status, role: "member", is_active: true,
      joined_at: status === "approved" ? (existingJoined || now) : existingJoined || null,
      reviewed_by: actor || null, reviewed_at: status === "pending" ? null : now });
    app.save(record);
    const ids = user.get("memberships") || [];
    if (ids.indexOf(record.id) === -1) user.set("memberships", ids.concat([record.id]));
    return record;
  },
  hasApprovedMembership(app, user, team) {
    if (!user || !team) return false;
    try {
      const record = app.findFirstRecordByFilter("team_memberships", "user = {:user} && team = {:team} && status = \"approved\" && is_active = true", { user: user.id, team });
      return Boolean(record);
    } catch (_) {
      return false;
    }
  },
  syncUserStatus(app, user) {
    const records = app.findRecordsByFilter("team_memberships", "user = {:user} && is_active = true", "", 200, 0, { user: user.id });
    const statuses = records.map((record) => record.getString("status"));
    const status = statuses.indexOf("approved") >= 0 ? "approved" : statuses.indexOf("pending") >= 0 ? "pending" : "rejected";
    user.set("status", status);
    app.save(user);
    return status;
  },
  audit(app, actor, action, targetType, targetId, metadata) {
    const record = new Record(app.findCollectionByNameOrId("audit_logs"));
    record.load({ actor, action, target_type: targetType, target_id: targetId,
      at: new Date().toISOString(), metadata });
    app.save(record);
  },
  only(body, keys) {
    if (Object.keys(body).some((key) => keys.indexOf(key) === -1)) {
      throw new BadRequestError("请求包含不允许的字段");
    }
  },
};
