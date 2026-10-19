// Hide administrator-only resource summaries from anonymous and member lists.
migrate((app) => {
  const resources = app.findCollectionByNameOrId("resources");
  const admin = '@request.auth.id != "" && @request.auth.is_active = true && @request.auth.role = "admin"';
  resources.listRule = 'status = "published" && (visibility != "admin" || (' + admin + '))';
  resources.viewRule = 'status = "published" && (visibility != "admin" || (' + admin + '))';
  app.save(resources);
}, () => {
  throw new Error("resource_visibility 不能自动回滚；请恢复匹配版本的 PocketBase 设置备份。");
});
