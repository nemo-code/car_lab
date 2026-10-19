// Candidate project media collection. Public project assets are metadata and
// optional files; all writes go through the audited lab routes below.
migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects");
  const users = app.findCollectionByNameOrId("users");
  const admin = '@request.auth.id != "" && @request.auth.is_active = true && @request.auth.role = "admin"';
  const published = 'project.status = "published" && published = true && availability = "available"';
  const collection = new Collection({
    name: "project_assets",
    type: "base",
    fields: [
      { name: "project", type: "relation", collectionId: projects.id, required: true, maxSelect: 1, cascadeDelete: false },
      { name: "kind", type: "select", required: true, maxSelect: 1, values: ["image", "video", "file"] },
      { name: "label", type: "text", required: true, max: 160 },
      { name: "source_type", type: "select", required: true, maxSelect: 1, values: ["upload", "legacy", "external"] },
      { name: "availability", type: "select", required: true, maxSelect: 1, values: ["available", "missing", "offline"] },
      { name: "legacy_path", type: "text", required: false, max: 500 },
      { name: "file", type: "file", maxSelect: 1, maxSize: 31457280, mimeTypes: [
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "video/mp4", "video/webm", "video/quicktime",
        "application/pdf", "image/svg+xml", "text/plain", "application/zip",
        "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ] },
      { name: "size", type: "number", min: 0, onlyInt: true },
      { name: "mime", type: "text", required: false, max: 160 },
      { name: "sort_order", type: "number", onlyInt: true },
      { name: "published", type: "bool" },
      { name: "created_by", type: "relation", collectionId: users.id, required: false, maxSelect: 1, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule: published + " || (" + admin + ")",
    viewRule: published + " || (" + admin + ")",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE INDEX idx_project_assets_project_order ON project_assets (project, sort_order)",
      "CREATE INDEX idx_project_assets_public ON project_assets (project, published, availability)",
    ],
  });
  app.save(collection);
}, () => {
  throw new Error("project_assets 不能自动删除数据；请恢复匹配版本的一致性备份。");
});
