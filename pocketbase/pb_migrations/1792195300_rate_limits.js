// Application-level abuse protection for public member entry points.
migrate((app) => {
  const settings = app.settings();
  settings.rateLimits = {
    enabled: true,
    excludedIPs: [],
    rules: [
      { label: "POST /api/lab/apply", audience: "@guest", duration: 60, maxRequests: 5 },
      { label: "POST /api/collections/users/auth-with-password", audience: "@guest", duration: 60, maxRequests: 10 },
    ],
  };
  app.save(settings);
}, () => {
  // Keep the protection enabled when rolling back a schema snapshot manually.
  throw new Error("rate_limits 不能自动回滚；请恢复匹配版本的 PocketBase 设置备份。");
});
