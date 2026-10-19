// Candidate schema for PocketBase 0.40.5. No production migration has run.
migrate((app) => {
  const admin = '@request.auth.id != "" && @request.auth.is_active = true && @request.auth.role = "admin"';
  const own = '@request.auth.id != "" && @request.auth.is_active = true && id = @request.auth.id';
  const created = { name: "created", type: "autodate", onCreate: true, onUpdate: false };
  const updated = { name: "updated", type: "autodate", onCreate: true, onUpdate: true };
  const pendingRules = [];
  const save = (name, fields, options) => {
    let collection;
    if (name === "users") {
      // PocketBase 0.40.5 creates the default users auth collection in a new
      // data directory. Extend that collection instead of creating a duplicate.
      collection = app.findCollectionByNameOrId("users");
      const existing = new Set(collection.fields.map((field) => field.name));
      for (const field of fields) {
        if (existing.has(field.name)) continue;
        const values = Object.assign({}, field);
        delete values.type;
        const Field = { text: TextField, select: SelectField, relation: RelationField,
          bool: BoolField, date: DateField, number: NumberField, json: JSONField,
          file: FileField }[field.type];
        if (!Field) throw new Error("Unsupported users field type: " + field.type);
        collection.fields.add(new Field(values));
      }
      const email = collection.fields.find((field) => field.name === "email");
      if (email) email.required = false;
      Object.assign(collection, options || {});
    } else {
      collection = new Collection(Object.assign({
        name, type: "base", fields: fields.concat([created, updated]),
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      }, options || {}));
    }
    // Save every schema before validating rules that reference later collections.
    const rules = {};
    for (const key of ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]) {
      rules[key] = collection[key];
      collection[key] = null;
    }
    app.save(collection);
    pendingRules.push({ collection, rules });
    return collection;
  };
  const text = (name, required, max) => ({ name, type: "text", required, max });
  const select = (name, values) => ({ name, type: "select", required: true, maxSelect: 1, values });
  const relation = (name, collection, required) => ({
    name, type: "relation", collectionId: collection.id, required,
    maxSelect: 1, cascadeDelete: false,
  });
  const teams = save("teams", [
    text("code", true, 30), text("name", true, 100), text("description", false, 10000),
    { name: "image", type: "file", maxSelect: 1, maxSize: 5242880, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
    { name: "sort", type: "number", onlyInt: true }, { name: "enabled", type: "bool" },
  ], { listRule: 'enabled = true || (' + admin + ')', viewRule: 'enabled = true || (' + admin + ')',
    // Team content is written through /api/lab/teams/{id}, which validates
    // the editable fields and records an audit event.
    createRule: null, updateRule: null, deleteRule: null,
    indexes: ['CREATE UNIQUE INDEX idx_teams_code ON teams (code)'] });
  const users = save("users", [
    text("legacy_user_id", false, 80),
    { name: "student_id", type: "text", pattern: "^[0-9]{11}$", max: 11 },
    { name: "username", type: "text", pattern: "^$|^[a-z][a-z0-9_.-]{2,29}$", max: 30 },
    text("name", true, 80), text("grade", false, 12), relation("primary_team", teams, false),
    select("status", ["pending", "approved", "rejected"]), select("role", ["member", "admin"]),
    { name: "is_active", type: "bool" },
  ], { type: "auth", listRule: admin, viewRule: '(' + own + ') || (' + admin + ')',
    createRule: null, updateRule: null, deleteRule: null,
    authRule: 'is_active = true', manageRule: null,
    passwordAuth: { enabled: true, identityFields: ["email", "student_id", "username"] },
    indexes: [
      'CREATE UNIQUE INDEX idx_users_legacy_user_id ON users (legacy_user_id) WHERE legacy_user_id != \'\'',
      'CREATE UNIQUE INDEX idx_users_student_id ON users (student_id) WHERE student_id != \'\'',
      'CREATE UNIQUE INDEX idx_users_username ON users (username COLLATE NOCASE) WHERE username != \'\'',
    ],
  });
  save("applications", [relation("user", users, true), relation("team", teams, true),
    text("statement", false, 3000), select("status", ["pending", "approved", "rejected"]),
    relation("reviewed_by", users, false), { name: "reviewed_at", type: "date" },
    text("review_note", false, 1000), text("legacy_created_at", false, 40),
  ], { listRule: '(' + admin + ') || (@request.auth.is_active = true && user = @request.auth.id)',
    viewRule: '(' + admin + ') || (@request.auth.is_active = true && user = @request.auth.id)',
    indexes: ['CREATE INDEX idx_applications_user ON applications (user)'] });
  save("projects", [
    text("legacy_id", false, 80), text("edition", true, 80), text("slug", true, 80), text("group_label", true, 120),
    select("category", ["hardware", "software", "game"]), text("category_label", true, 80), text("title", true, 200),
    text("subtitle", true, 300), text("summary", true, 2000),
    { name: "tags", type: "json", maxSize: 5000 }, { name: "highlights", type: "json", maxSize: 10000 },
    { name: "outcomes", type: "json", maxSize: 5000 }, { name: "tech", type: "json", maxSize: 5000 },
    text("members_text", false, 500), { name: "media", type: "json", maxSize: 12000 },
    { name: "videos", type: "json", maxSize: 12000 }, { name: "files", type: "json", maxSize: 12000 },
    text("accent", false, 40), { name: "sort_order", type: "number", onlyInt: true },
    select("status", ["draft", "published", "offline"]), relation("created_by", users, false),
    { name: "published_at", type: "date" },
  ], { listRule: 'status = "published" || (' + admin + ')', viewRule: 'status = "published" || (' + admin + ')',
    createRule: null, updateRule: null, deleteRule: null,
    indexes: ['CREATE UNIQUE INDEX idx_projects_slug ON projects (slug)', 'CREATE INDEX idx_projects_status_order ON projects (status, sort_order)'] });
  const resources = save("resources", [relation("team", teams, false), text("title", true, 200),
    text("summary", false, 1000), select("visibility", ["public", "team", "admin"]),
    select("status", ["draft", "published", "offline"]), relation("created_by", users, true), text("legacy_created_at", false, 40),
  ], { listRule: 'status = "published" || (' + admin + ')', viewRule: 'status = "published" || (' + admin + ')',
    createRule: null, updateRule: null, deleteRule: null });
  const contentListAccess = '(' + admin + ') || (resource.status = "published" && resource.visibility = "public")';
  const contentViewAccess = '(' + admin + ') || (resource.status = "published" && (' +
    'resource.visibility = "public" || (@request.auth.id != "" && @request.auth.is_active = true && resource.visibility = "team")))';
  save("resource_contents", [relation("resource", resources, true), relation("team", teams, false), text("body", false, 100000), text("legacy_created_at", false, 40),
    { name: "file", type: "file", protected: true, maxSelect: 1, maxSize: 31457280,
      mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain",
        "application/zip", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"] },
    text("filename", false, 255), { name: "size", type: "number", min: 0, onlyInt: true },
  ], { listRule: contentListAccess, viewRule: contentViewAccess, createRule: null, updateRule: null, deleteRule: null,
    indexes: ['CREATE UNIQUE INDEX idx_contents_resource ON resource_contents (resource)'] });
  save("site_pages", [text("key", true, 80), text("title", true, 200),
    { name: "payload", type: "json", required: true, maxSize: 100000 }, { name: "published", type: "bool" },
  ], { listRule: 'published = true || (' + admin + ')', viewRule: 'published = true || (' + admin + ')',
    createRule: null, updateRule: null, deleteRule: null, indexes: ['CREATE UNIQUE INDEX idx_site_pages_key ON site_pages (key)'] });
  save("audit_logs", [relation("actor", users, false), text("action", true, 80),
    text("target_type", true, 80), text("target_id", true, 30), { name: "at", type: "date", required: true },
    { name: "metadata", type: "json", maxSize: 4000 },
  ], { listRule: admin, viewRule: admin });
  for (const entry of pendingRules) {
    for (const key of Object.keys(entry.rules)) {
      entry.collection[key] = entry.rules[key] == null ? null : String(entry.rules[key]);
    }
    app.save(entry.collection);
  }
  for (const [code, name, sort] of [["software", "软件团队", 1], ["hardware", "硬件团队", 2], ["simulation", "游戏与仿真团队", 3]]) {
    const team = new Record(teams);
    team.load({ code, name, sort, enabled: true });
    app.save(team);
  }
}, () => {
  // This avoids accidentally dropping imported users/files through migrate down.
  throw new Error("lab_schema 不能自动删除数据；请停止隔离实例并恢复匹配版本的一致性备份。");
});
