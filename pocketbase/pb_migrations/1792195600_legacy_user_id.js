// Preserve the opaque source user ID on imported accounts for controlled reconciliation.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.some((field) => field.name === "legacy_user_id")) {
    users.fields.add(new TextField({ name: "legacy_user_id", required: false, max: 80 }));
  }
  if (!users.indexes.some((index) => String(index).includes("idx_users_legacy_user_id"))) {
    users.indexes = users.indexes.concat([
      'CREATE UNIQUE INDEX idx_users_legacy_user_id ON users (legacy_user_id) WHERE legacy_user_id != \'\'',
    ]);
  }
  app.save(users);
}, () => {
  throw new Error("legacy_user_id 不能自动回滚；请恢复匹配版本的一致性 PocketBase 备份。");
});
