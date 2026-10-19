// Members may read their own team memberships so the frontend can render
// approved team access; administrators can inspect all memberships.
migrate((app) => {
  const membership = app.findCollectionByNameOrId("team_memberships");
  const admin = '@request.auth.id != "" && @request.auth.is_active = true && @request.auth.role = "admin"';
  const owner = '@request.auth.id != "" && @request.auth.is_active = true && user = @request.auth.id';
  const readRule = "(" + owner + ") || (" + admin + ")";
  membership.listRule = readRule;
  membership.viewRule = readRule;
  app.save(membership);
}, (app) => {
  const membership = app.findCollectionByNameOrId("team_memberships");
  membership.listRule = null;
  membership.viewRule = null;
  app.save(membership);
});
