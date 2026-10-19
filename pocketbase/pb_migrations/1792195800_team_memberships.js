// Independent multi-team memberships. users.primary_team remains a compatibility/default field.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const teams = app.findCollectionByNameOrId("teams");
  const membership = new Collection({
    name: "team_memberships",
    type: "base",
    fields: [
      { name: "user", type: "relation", collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: false },
      { name: "team", type: "relation", collectionId: teams.id, required: true, maxSelect: 1, cascadeDelete: false },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "approved", "rejected", "revoked"] },
      { name: "role", type: "select", required: true, maxSelect: 1, values: ["member"] },
      { name: "is_active", type: "bool" },
      { name: "joined_at", type: "date" },
      { name: "reviewed_by", type: "relation", collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: "reviewed_at", type: "date" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX idx_team_memberships_user_team ON team_memberships (user, team)",
      "CREATE INDEX idx_team_memberships_team_status ON team_memberships (team, status, is_active)",
    ],
  });
  app.save(membership);
  if (!users.fields.find((field) => field.name === "memberships")) {
    users.fields.add(new RelationField({ name: "memberships", collectionId: membership.id, maxSelect: 99, cascadeDelete: false }));
    app.save(users);
  }
  const admin = '@request.auth.id != "" && @request.auth.is_active = true && @request.auth.role = "admin"';
  const contentListAccess = '(' + admin + ') || (resource.status = "published" && resource.visibility = "public")';
  const contentViewAccess = '(' + admin + ') || (resource.status = "published" && (' +
    'resource.visibility = "public" || (@request.auth.id != "" && @request.auth.is_active = true && resource.visibility = "team")))';
  const contents = app.findCollectionByNameOrId("resource_contents");
  contents.listRule = contentListAccess;
  contents.viewRule = contentViewAccess;
  app.save(contents);
}, () => {
  throw new Error("team_memberships 不能自动回滚；请恢复匹配版本的 PocketBase 一致性备份。");
});
