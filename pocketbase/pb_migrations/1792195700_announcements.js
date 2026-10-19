// Versioned announcements collection for PocketBase 0.40.5.
migrate((app) => {
  const collection = new Collection({
    name: "announcements",
    type: "base",
    fields: [
      { name: "slug", type: "text", required: true, max: 80 },
      { name: "title", type: "text", required: true, max: 160 },
      { name: "summary", type: "text", max: 500 },
      { name: "body", type: "text", required: true, max: 20000 },
      { name: "kind", type: "select", required: true, maxSelect: 1, values: ["notice", "news"] },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["draft", "published", "offline"] },
      { name: "pinned", type: "bool" },
      { name: "sort_order", type: "number", onlyInt: true, min: 0 },
      { name: "published_at", type: "date" },
      { name: "created_by", type: "relation", collectionId: app.findCollectionByNameOrId("users").id, maxSelect: 1, cascadeDelete: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    indexes: [
      "CREATE UNIQUE INDEX idx_announcements_slug ON announcements (slug)",
      "CREATE INDEX idx_announcements_status_order ON announcements (status, pinned, sort_order, published_at)",
    ],
  });
  app.save(collection);
}, () => {
  throw new Error("announcements 不能自动回滚；请恢复匹配版本的 PocketBase 一致性备份。");
});
