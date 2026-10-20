routerAdd("POST", "/api/lab/resources", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body;
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const input = admin.resourceInput(app, body, true);
    const resource = new Record(app.findCollectionByNameOrId("resources"));
    resource.load({ team: input.team, title: input.title, summary: input.summary, visibility: input.visibility,
      status: input.status, created_by: actor.id });
    app.save(resource);
    const content = admin.saveContent(app, resource, input, null);
    lab.audit(app, actor.id, input.status === "published" ? "resource.publish" : "resource.create", "resources", resource.id, { visibility: input.visibility, status: input.status });
    result = { resource, content, team_code: input.teamCode };
  });
  return e.json(201, result);
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/lab/admin/resources", (e) => {
  const lab = require(__hooks + "/lab.js");
  const user = lab.activeUser(e.app, e.auth, true);
  const records = e.app.findRecordsByFilter("resources", "", "-created", 200, 0);
  const data = records.map((resource) => {
    const team = e.app.findRecordById("teams", resource.getString("team"));
    const content = e.app.findFirstRecordByFilter("resource_contents", "resource = {:resource}", { resource: resource.id });
    return {
      id: resource.id,
      team: resource.getString("team"),
      team_code: team.getString("code"),
      title: resource.getString("title"),
      summary: resource.getString("summary"),
      visibility: resource.getString("visibility"),
      status: resource.getString("status"),
      created: resource.getString("created"),
      updated: resource.getString("updated"),
      body: content ? content.getString("body") : "",
      file: content ? content.getString("file") : "",
      filename: content ? content.getString("filename") : "",
      size: content ? content.getInt("size") : 0,
      content_id: content ? content.id : "",
    };
  });
  return e.json(200, { data });
}, $apis.requireAuth("users"));

routerAdd("PATCH", "/api/lab/resources/{id}", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body;
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const resource = app.findRecordById("resources", e.request.pathValue("id"));
    const existing = app.findFirstRecordByFilter("resource_contents", "resource = {:resource}", { resource: resource.id });
    const input = admin.resourceInput(app, body, true, resource);
    const previous = resource.getString("status");
    resource.load({ team: input.team, title: input.title, summary: input.summary, visibility: input.visibility, status: input.status });
    app.save(resource);
    const content = admin.saveContent(app, resource, input, existing);
    const action = previous !== input.status
      ? (input.status === "published" ? "resource.publish" : input.status === "offline" ? "resource.offline" : "resource.draft")
      : "resource.update";
    lab.audit(app, actor.id, action, "resources", resource.id, { visibility: input.visibility, status: input.status });
    result = { resource, content, team_code: input.teamCode };
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/lab/resources/{id}", (e) => {
  const lab = require(__hooks + "/lab.js");
  const resource = e.app.findRecordById("resources", e.request.pathValue("id"));
  let user = null;
  try { user = lab.activeUser(e.app, e.auth, false); } catch (_) {}
  const isAdmin = Boolean(user && user.getString("role") === "admin");
  const visibility = resource.getString("visibility");
  const published = resource.getString("status") === "published";
  const allowed = isAdmin || (published && visibility === "public") ||
    (published && visibility === "team" && user && lab.hasApprovedMembership(e.app, user, resource.getString("team")));
  if (!allowed) throw new NotFoundError("资源不存在");
  if (visibility === "admin" && !isAdmin) throw new NotFoundError("资源不存在");
  const team = e.app.findRecordById("teams", resource.getString("team"));
  const content = e.app.findFirstRecordByFilter("resource_contents", "resource = {:resource}", { resource: resource.id });
  return e.json(200, {
    resource: {
      id: resource.id,
      team: resource.getString("team"),
      team_code: team.getString("code"),
      title: resource.getString("title"),
      summary: resource.getString("summary"),
      visibility,
      status: resource.getString("status"),
      created: resource.getString("created"),
      updated: resource.getString("updated"),
    },
    content: content ? {
      id: content.id,
      resource: content.getString("resource"),
      team: content.getString("team"),
      body: content.getString("body"),
      file: content.getString("file"),
      filename: content.getString("filename"),
      size: content.getInt("size"),
    } : null,
    team_code: team.getString("code"),
  });
});

routerAdd("POST", "/api/lab/resources/{id}/file", (e) => {
  const lab = require(__hooks + "/lab.js");
  const body = e.requestInfo().body;
  lab.only(body, ["resource", "body", "filename", "size"]);
  const files = e.findUploadedFiles("file");
  if (!files || !files.length) throw new BadRequestError("附件不能为空");
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const resource = app.findRecordById("resources", e.request.pathValue("id"));
    const content = app.findFirstRecordByFilter("resource_contents", "resource = {:resource}", { resource: resource.id });
    const filename = String(body.filename || files[0].name || "").trim();
    const size = Number(body.size || 0);
    if (!filename || !Number.isInteger(size) || size < 1 || size > 31457280) throw new BadRequestError("附件字段无效");
    content.load({ body: String(body.body || ""), filename, size, file: files });
    app.save(content);
    lab.audit(app, actor.id, "resource.file", "resources", resource.id, { size });
    result = content;
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

routerAdd("DELETE", "/api/lab/resources/{id}/file", (e) => {
  const lab = require(__hooks + "/lab.js");
  if (Object.keys(e.requestInfo().body || {}).length) throw new BadRequestError("请求不应包含字段");
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const resource = app.findRecordById("resources", e.request.pathValue("id"));
    const content = app.findFirstRecordByFilter("resource_contents", "resource = {:resource}", { resource: resource.id });
    if (content) {
      content.load({ file: null, filename: "", size: 0 });
      app.save(content);
    }
    lab.audit(app, actor.id, "resource.file_remove", "resources", resource.id, {});
  });
  return e.json(200, { ok: true });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/resources/{id}/offline", (e) => {
  const lab = require(__hooks + "/lab.js");
  if (Object.keys(e.requestInfo().body || {}).length) throw new BadRequestError("请求不应包含字段");
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const resource = app.findRecordById("resources", e.request.pathValue("id"));
    resource.set("status", "offline");
    app.save(resource);
    lab.audit(app, actor.id, "resource.offline", "resources", resource.id, {});
  });
  return e.json(200, { status: "offline" });
}, $apis.requireAuth("users"));

routerAdd("PATCH", "/api/lab/resources/{id}/status", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body || {};
  lab.only(body, ["status"]);
  if (admin.resourceStatuses.indexOf(String(body.status || "")) === -1) throw new BadRequestError("资源状态无效");
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const resource = app.findRecordById("resources", e.request.pathValue("id"));
    const previous = resource.getString("status");
    const status = String(body.status);
    resource.set("status", status);
    app.save(resource);
    if (previous !== status) {
      const action = status === "published" ? "resource.publish" : status === "offline" ? "resource.offline" : "resource.draft";
      lab.audit(app, actor.id, action, "resources", resource.id, { from_status: previous, status });
    }
    result = resource;
  });
  return e.json(200, { resource: result, status: result.getString("status") });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/projects", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body;
  lab.only(body, ["legacy_id", "edition", "slug", "group_label", "category", "category_label", "title", "subtitle", "summary", "tags", "highlights", "outcomes", "tech", "members_text", "media", "videos", "files", "accent", "sort_order", "status"]);
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const input = admin.projectInput(body);
    const project = new Record(app.findCollectionByNameOrId("projects"));
    project.load({ ...input, created_by: actor.id, published_at: input.status === "published" ? new Date().toISOString() : null });
    app.save(project);
    lab.audit(app, actor.id, "project.create", "projects", project.id, { slug: input.slug, status: input.status });
    result = project;
  });
  return e.json(201, result);
}, $apis.requireAuth("users"));

routerAdd("PATCH", "/api/lab/projects/{id}", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body;
  lab.only(body, ["legacy_id", "edition", "slug", "group_label", "category", "category_label", "title", "subtitle", "summary", "tags", "highlights", "outcomes", "tech", "members_text", "media", "videos", "files", "accent", "sort_order", "status"]);
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const input = admin.projectInput(body);
    const project = app.findRecordById("projects", e.request.pathValue("id"));
    project.load({ ...input, published_at: input.status === "published" ? (project.getString("published_at") || new Date().toISOString()) : project.getString("published_at") });
    app.save(project);
    lab.audit(app, actor.id, "project.update", "projects", project.id, { slug: input.slug, status: input.status });
    result = project;
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/projects/{id}/offline", (e) => {
  const lab = require(__hooks + "/lab.js");
  if (Object.keys(e.requestInfo().body || {}).length) throw new BadRequestError("请求不应包含字段");
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const project = app.findRecordById("projects", e.request.pathValue("id"));
    project.set("status", "offline");
    app.save(project);
    lab.audit(app, actor.id, "project.offline", "projects", project.id, {});
    result = project;
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

function projectAssetAdmin(app, auth) {
  if (!auth) return null;
  try { return require(__hooks + "/lab.js").activeUser(app, auth, true); } catch (_) { return null; }
}

function projectAssetRows(app, project, admin) {
  const filter = admin
    ? "project = {:project}"
    : 'project = {:project} && published = true && availability = "available"';
  return app.findRecordsByFilter("project_assets", filter, "sort_order,created", 200, 0, { project: project.id });
}

routerAdd("GET", "/api/lab/projects/{id}/assets", (e) => {
  const content = require(__hooks + "/admin-content.js");
  let adminView = false;
  try {
    require(__hooks + "/lab.js").activeUser(e.app, e.auth, true);
    adminView = true;
  } catch (_) {}
  const project = content.resolveProject(e.app, e.request.pathValue("id"));
  if (!adminView && project.getString("status") !== "published") throw new BadRequestError("项目不存在");
  const filter = adminView
    ? "project = {:project}"
    : 'project = {:project} && published = true && availability = "available"';
  const records = e.app.findRecordsByFilter("project_assets", filter, "sort_order,created", 200, 0, { project: project.id });
  return e.json(200, { data: records.map((record) => content.projectAssetRecord(e.app, record)) });
});

routerAdd("POST", "/api/lab/projects/{id}/assets", (e) => {
  const lab = require(__hooks + "/lab.js");
  const content = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body || {};
  let files = [];
  try {
    files = e.findUploadedFiles("file") || [];
  } catch (error) {
    // PocketBase 0.40.5 throws when a multipart metadata-only request has no
    // field named `file`; legacy and external references are valid without it.
    if (String(error).indexOf("no such file") === -1) throw error;
  }
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const input = content.projectAssetInput(app, { ...body, project: e.request.pathValue("id") });
    if (input.source_type === "upload" && input.availability === "available" && !files.length) {
      throw new BadRequestError("上传素材文件不能为空");
    }
    if (files.length) content.validateProjectAssetFile(input.kind, files[0]);
    const asset = new Record(app.findCollectionByNameOrId("project_assets"));
    asset.load({ project: input.project.id, kind: input.kind, label: input.label, source_type: input.source_type,
      availability: input.availability, legacy_path: input.legacy_path, sort_order: input.sort_order,
      published: input.published, created_by: actor.id, size: files[0]?.size || 0, mime: files[0]?.type || "" });
    if (files.length) asset.set("file", files);
    app.save(asset);
    lab.audit(app, actor.id, "project_asset.create", "project_assets", asset.id,
      { project_id: input.project.id, kind: input.kind, source_type: input.source_type, uploaded: Boolean(files.length) });
    result = content.projectAssetRecord(app, asset);
  });
  return e.json(201, result);
}, $apis.requireAuth("users"));

routerAdd("PATCH", "/api/lab/project-assets/{id}", (e) => {
  const lab = require(__hooks + "/lab.js");
  const content = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body || {};
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const asset = app.findRecordById("project_assets", e.request.pathValue("id"));
    const input = content.projectAssetInput(app, body, asset);
    asset.load({ project: input.project.id, kind: input.kind, label: input.label, source_type: input.source_type,
      availability: input.availability, legacy_path: input.legacy_path, sort_order: input.sort_order, published: input.published });
    app.save(asset);
    lab.audit(app, actor.id, "project_asset.update", "project_assets", asset.id,
      { project_id: input.project.id, kind: input.kind, availability: input.availability, published: input.published });
    result = content.projectAssetRecord(app, asset);
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/project-assets/{id}/file", (e) => {
  const lab = require(__hooks + "/lab.js");
  const content = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body || {};
  lab.only(body, []);
  const files = e.findUploadedFiles("file") || [];
  if (!files.length) throw new BadRequestError("上传素材文件不能为空");
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const asset = app.findRecordById("project_assets", e.request.pathValue("id"));
    content.validateProjectAssetFile(asset.getString("kind"), files[0]);
    asset.load({ file: files, source_type: "upload", availability: "available", size: files[0]?.size || 0,
      mime: files[0]?.type || "", published: false });
    app.save(asset);
    lab.audit(app, actor.id, "project_asset.file", "project_assets", asset.id,
      { project_id: asset.getString("project"), size: files[0]?.size || 0, mime: files[0]?.type || "" });
    result = content.projectAssetRecord(app, asset);
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/project-assets/{id}/offline", (e) => {
  const lab = require(__hooks + "/lab.js");
  const content = require(__hooks + "/admin-content.js");
  if (Object.keys(e.requestInfo().body || {}).length) throw new BadRequestError("请求不应包含字段");
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const asset = app.findRecordById("project_assets", e.request.pathValue("id"));
    asset.load({ availability: "offline", published: false, file: null, size: 0, mime: "" });
    app.save(asset);
    lab.audit(app, actor.id, "project_asset.offline", "project_assets", asset.id,
      { project_id: asset.getString("project") });
    result = content.projectAssetRecord(app, asset);
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

routerAdd("PATCH", "/api/lab/teams/{id}", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body || {};
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const team = app.findFirstRecordByFilter("teams", "id = {:id} || code = {:id}", { id: e.request.pathValue("id") });
    if (!team) throw new BadRequestError("团队不存在");
    const input = admin.teamInput(body, team);
    team.load({ name: input.name, description: JSON.stringify({ caption: input.caption, image: input.image, intro: input.intro, learn: input.learn, practice: input.practice }), sort: input.sort, enabled: input.enabled });
    app.save(team);
    lab.audit(app, actor.id, "team.update", "teams", team.id, { code: team.getString("code"), enabled: input.enabled });
    result = team;
  });
  return e.json(200, result);
}, $apis.requireAuth("users"));

routerAdd("PATCH", "/api/lab/site", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body;
  lab.only(body, ["section", "value"]);
  const section = String(body.section || "");
  if (admin.sections.indexOf(section) === -1) throw new BadRequestError("官网内容区块无效");
  try { admin.validateSiteSection(section, body.value); } catch (error) { throw new BadRequestError(error.message || "官网内容结构无效"); }
  let payload;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    let existing = null;
    try { existing = app.findFirstRecordByFilter("site_pages", 'key = "site"', {}); } catch (_) { existing = null; }
    let current = {};
    if (existing) {
      try {
        const parsed = JSON.parse(existing.getString("payload") || "{}");
        if (parsed && typeof parsed === "object") current = parsed;
      } catch (_) {
        current = {};
      }
    }
    payload = Object.assign({}, current, { [section]: body.value });
    try {
      admin.validateSitePayload(payload);
      admin.validateSitePayloadSize(payload);
    } catch (error) {
      throw new BadRequestError(error.message || "官网内容结构无效");
    }
    const record = existing || new Record(app.findCollectionByNameOrId("site_pages"));
    record.load({ key: "site", title: "实验室官网内容", payload, published: true });
    app.save(record);
    lab.audit(app, actor.id, "site.update", "site_pages", record.id, { section });
  });
  return e.json(200, { data: payload });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/site-seed", (e) => {
  const body = e.requestInfo().body;
  const admin = require(__hooks + "/admin-content.js");
  try { admin.validateSitePayload(body?.payload); admin.validateSitePayloadSize(body.payload); }
  catch (error) { throw new BadRequestError(error.message || "官网初始内容无效"); }
  const sections = admin.sections;
  let record;
  e.app.runInTransaction((app) => {
    let existing = null;
    try { existing = app.findFirstRecordByFilter("site_pages", 'key = "site"', {}); } catch (_) { existing = null; }
    record = existing || new Record(app.findCollectionByNameOrId("site_pages"));
    record.load({ key: "site", title: "实验室官网内容", payload: body.payload, published: true });
    app.save(record);
  });
  return e.json(200, { id: record.id, sections: sections.length });
}, $apis.requireSuperuserAuth());

routerAdd("GET", "/api/lab/announcements", (e) => {
  const now = Date.now();
  const records = e.app.findRecordsByFilter("announcements", 'status = "published"', "-pinned,sort_order,-published_at,id", 200, 0);
  const data = records.filter((record) => {
    const publishedAt = record.getString("published_at");
    return record.getString("status") === "published" && (!publishedAt || Date.parse(publishedAt) <= now);
  }).map((record) => require(__hooks + "/admin-content.js").announcementRecord(record, false));
  return e.json(200, { data });
});

routerAdd("GET", "/api/lab/announcements/{ref}", (e) => {
  const ref = String(e.request.pathValue("ref") || "");
  const records = e.app.findRecordsByFilter("announcements", "id = {:ref} || slug = {:ref}", "", 1, 0, { ref });
  const record = records[0];
  const publishedAt = record?.getString("published_at") || "";
  if (!record || record.getString("status") !== "published" || (publishedAt && Date.parse(publishedAt) > Date.now())) {
    throw new BadRequestError("公告不存在");
  }
  return e.json(200, { data: require(__hooks + "/admin-content.js").announcementRecord(record, true) });
});

routerAdd("GET", "/api/lab/admin/announcements", (e) => {
  const lab = require(__hooks + "/lab.js");
  lab.activeUser(e.app, e.auth, true);
  const records = e.app.findRecordsByFilter("announcements", "", "status, -pinned, sort_order, -updated", 200, 0);
  return e.json(200, { data: records.map((record) => require(__hooks + "/admin-content.js").announcementRecord(record, true)) });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/admin/announcements", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body || {};
  lab.only(body, ["slug", "title", "summary", "body", "kind", "status", "pinned", "sort_order"]);
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const input = admin.announcementInput(body);
    const record = new Record(app.findCollectionByNameOrId("announcements"));
    record.load({ ...input, published_at: input.status === "published" ? new Date().toISOString() : null, created_by: actor.id });
    app.save(record);
    lab.audit(app, actor.id, input.status === "published" ? "announcement.publish" : "announcement.create", "announcements", record.id, { slug: input.slug, status: input.status });
    result = admin.announcementRecord(record, true);
  });
  return e.json(201, { data: result });
}, $apis.requireAuth("users"));

routerAdd("PATCH", "/api/lab/admin/announcements/{id}", (e) => {
  const lab = require(__hooks + "/lab.js");
  const admin = require(__hooks + "/admin-content.js");
  const body = e.requestInfo().body || {};
  lab.only(body, ["slug", "title", "summary", "body", "kind", "status", "pinned", "sort_order"]);
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const record = app.findRecordById("announcements", e.request.pathValue("id"));
    const previous = record.getString("status");
    const input = admin.announcementInput(body, record);
    const publishedAt = input.status === "published" ? (record.getString("published_at") || new Date().toISOString()) : record.getString("published_at");
    record.load({ ...input, published_at: publishedAt });
    app.save(record);
    const action = input.status === "published" && previous !== "published" ? "announcement.publish" : "announcement.update";
    lab.audit(app, actor.id, action, "announcements", record.id, { slug: input.slug, status: input.status });
    result = admin.announcementRecord(record, true);
  });
  return e.json(200, { data: result });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/admin/announcements/{id}/offline", (e) => {
  const lab = require(__hooks + "/lab.js");
  if (Object.keys(e.requestInfo().body || {}).length) throw new BadRequestError("请求不应包含字段");
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const record = app.findRecordById("announcements", e.request.pathValue("id"));
    record.set("status", "offline");
    app.save(record);
    lab.audit(app, actor.id, "announcement.offline", "announcements", record.id, { slug: record.getString("slug") });
    result = require(__hooks + "/admin-content.js").announcementRecord(record, true);
  });
  return e.json(200, { data: result });
}, $apis.requireAuth("users"));

routerAdd("GET", "/api/lab/admin/memberships", (e) => {
  const lab = require(__hooks + "/lab.js");
  lab.activeUser(e.app, e.auth, true);
  const records = e.app.findRecordsByFilter("team_memberships", "", "-created", 500, 0);
  const data = records.map((record) => {
    const user = e.app.findRecordById("users", record.getString("user"));
    const team = e.app.findRecordById("teams", record.getString("team"));
    return { id: record.id, user_id: user.id, name: user.getString("name"), student_id: user.getString("student_id"), username: user.getString("username"), grade: user.getString("grade"), user_role: user.getString("role"), team: team.getString("code"), status: record.getString("status"), role: record.getString("role"), is_active: record.getBool("is_active"), joined_at: record.getString("joined_at") || null, reviewed_at: record.getString("reviewed_at") || null };
  });
  return e.json(200, { data });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/admin/memberships/{id}/revoke", (e) => {
  const lab = require(__hooks + "/lab.js");
  if (Object.keys(e.requestInfo().body || {}).length) throw new BadRequestError("请求不应包含字段");
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const membership = app.findRecordById("team_memberships", e.request.pathValue("id"));
    const user = app.findRecordById("users", membership.getString("user"));
    if (user.getString("role") === "admin") throw new ForbiddenError("Administrator membership cannot be revoked");
    membership.load({ status: "revoked", is_active: false, reviewed_by: actor.id, reviewed_at: new Date().toISOString() });
    app.save(membership);
    lab.syncUserStatus(app, user);
    lab.audit(app, actor.id, "membership.revoke", "team_memberships", membership.id, { team: membership.getString("team") });
    result = { id: membership.id, status: "revoked", is_active: false };
  });
  return e.json(200, { data: result });
}, $apis.requireAuth("users"));

routerAdd("POST", "/api/lab/admin/memberships/{id}/restore", (e) => {
  const lab = require(__hooks + "/lab.js");
  if (Object.keys(e.requestInfo().body || {}).length) throw new BadRequestError("请求不应包含字段");
  let result;
  e.app.runInTransaction((app) => {
    const actor = lab.activeUser(app, e.auth, true);
    const membership = app.findRecordById("team_memberships", e.request.pathValue("id"));
    const user = app.findRecordById("users", membership.getString("user"));
    if (user.getString("role") === "admin") throw new ForbiddenError("Administrator membership cannot be changed here");
    membership.load({ status: "approved", is_active: true, reviewed_by: actor.id, reviewed_at: new Date().toISOString(), joined_at: membership.getString("joined_at") || new Date().toISOString() });
    app.save(membership);
    lab.syncUserStatus(app, user);
    lab.audit(app, actor.id, "membership.restore", "team_memberships", membership.id, { team: membership.getString("team") });
    result = { id: membership.id, status: "approved", is_active: true };
  });
  return e.json(200, { data: result });
}, $apis.requireAuth("users"));
