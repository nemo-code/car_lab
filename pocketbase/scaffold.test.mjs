import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script, createContext } from 'node:vm';
import test from 'node:test';

const root = dirname(fileURLToPath(import.meta.url));
const source = (path) => readFileSync(join(root, path), 'utf8');
const migration = source('pb_migrations/1792195200_lab_schema.js');
const rateLimitMigration = source('pb_migrations/1792195300_rate_limits.js');
const visibilityMigration = source('pb_migrations/1792195400_resource_visibility.js');
const projectAssetsMigration = source('pb_migrations/1792195500_project_assets.js');
const legacyUserIdMigration = source('pb_migrations/1792195600_legacy_user_id.js');
const announcementsMigration = source('pb_migrations/1792195700_announcements.js');
const membershipsMigration = source('pb_migrations/1792195800_team_memberships.js');
const membershipReadRulesMigration = source('pb_migrations/1792195900_membership_read_rules.js');
const fileTokenDurationMigration = source('pb_migrations/1792250303_updated_users.js');

test('users file tokens use a short application lifetime and restore the PocketBase default on rollback', () => {
  const users = { name: 'users', fileToken: { duration: 180 } };
  const migrations = [];
  const app = {
    findCollectionByNameOrId(name) { assert.equal(name, '_pb_users_auth_'); return users; },
    save(collection) { return collection; },
  };
  const context = createContext({
    app,
    migrate(up, rollback) { migrations.push({ up, rollback }); },
    unmarshal(value, target) { Object.assign(target, value); },
  });
  new Script(fileTokenDurationMigration).runInContext(context);
  assert.equal(migrations.length, 1);
  migrations[0].up(app);
  assert.equal(users.fileToken.duration, 120);
  migrations[0].rollback(app);
  assert.equal(users.fileToken.duration, 180);
});

test('migration declares project assets with public-read metadata and locked writes', () => {
  const collections = [];
  const records = [];
  const rollbacks = [];
  class Field {
    constructor(data) { Object.assign(this, data); }
  }
  class FieldList extends Array {
    add(field) { this.push(field); }
  }
  class Collection {
    constructor(data) { Object.assign(this, data); this.id = data.name; this.fields = new FieldList(...(data.fields || [])); }
  }
  class Record {
    constructor(collection) { this.collection = collection; }
    load(data) { Object.assign(this, data); }
  }
  const defaultUsers = new Collection({ name: 'users', type: 'auth', fields: [new Field({ name: 'email', type: 'text', required: true })] });
  const app = { findCollectionByNameOrId(name) {
    const found = collections.find((item) => item.name === name) || (name === 'users' ? defaultUsers : null);
    assert.ok(found, `missing collection ${name}`);
    return found;
  }, save(record) {
    const target = record instanceof Collection ? collections : records;
    if (!target.includes(record)) target.push(record);
  } };
  const constructors = Object.fromEntries(['TextField', 'SelectField', 'RelationField', 'BoolField', 'DateField', 'NumberField', 'JSONField', 'FileField'].map(name => [name, class extends Field {}]));
  const context = createContext({ Collection, Record, ...constructors, app, migrate(up, rollback) { up(app); rollbacks.push(rollback); } });
  new Script(migration).runInContext(context);
  new Script(projectAssetsMigration).runInContext(context);
  new Script(announcementsMigration).runInContext(context);
  new Script(membershipsMigration).runInContext(context);
  new Script(membershipReadRulesMigration).runInContext(context);
  assert.deepEqual(collections.map((item) => item.name), [
    'teams', 'users', 'applications', 'projects', 'resources', 'resource_contents', 'site_pages', 'audit_logs', 'project_assets', 'announcements', 'team_memberships',
  ]);
  const find = (name) => collections.find((item) => item.name === name);
  for (const name of ['users', 'applications', 'projects', 'resources', 'resource_contents', 'site_pages', 'audit_logs', 'project_assets', 'announcements', 'team_memberships', 'teams']) {
    for (const action of ['createRule', 'updateRule', 'deleteRule']) assert.equal(find(name)[action], null);
  }
  const contents = find('resource_contents');
  assert.equal(contents.fields.find((field) => field.name === 'team').collectionId, find('teams').id);
  assert.equal(contents.fields.find((field) => field.name === 'file').protected, true);
  assert.match(contents.listRule, /resource\.visibility = "public"/);
  assert.match(contents.viewRule, /@request.auth.is_active = true/);
  assert.match(contents.viewRule, /resource\.visibility = "public"/);
  assert.match(contents.viewRule, /resource\.visibility = "team"/);
  assert.doesNotMatch(contents.viewRule, /@request\.auth\.primary_team/);
  assert.match(contents.viewRule, /resource.status = "published"/);
  const memberships = find('team_memberships');
  assert.match(memberships.listRule, /user = @request.auth.id/);
  assert.match(memberships.listRule, /@request.auth.role = "admin"/);
  assert.equal(memberships.viewRule, memberships.listRule);
  assert.equal(find('resources').fields.some((field) => ['body', 'file'].includes(field.name)), false);
  const projects = find('projects');
  assert.equal(projects.fields.find((field) => field.name === 'media').type, 'json');
  assert.match(projects.listRule, /status = "published"/);
  const assets = find('project_assets');
  assert.equal(assets.fields.find((field) => field.name === 'project').collectionId, projects.id);
  assert.equal(JSON.stringify(assets.fields.find((field) => field.name === 'kind').values), JSON.stringify(['image', 'video', 'file']));
  assert.equal(assets.fields.find((field) => field.name === 'file').maxSize, 31457280);
  assert.match(assets.listRule, /project.status = "published"/);
  assert.match(assets.listRule, /published = true/);
  assert.match(assets.listRule, /availability = "available"/);
  assert.match(assets.listRule, /role = "admin"/);
  for (const collection of collections) {
    for (const field of collection.fields.filter((field) => field.type === 'relation')) {
      assert.ok(collections.some((target) => target.id === field.collectionId));
      assert.equal(field.cascadeDelete, false);
    }
  }
  assert.equal(records.length, 3);
  assert.throws(() => rollbacks[2](), /不能自动删除数据|不能自动回滚/);
  assert.throws(() => rollbacks[3](), /不能自动回滚/);
  rollbacks[4](app);
  assert.equal(find('team_memberships').listRule, null);
  assert.equal(find('team_memberships').viewRule, null);
});

test('migration preserves opaque legacy user IDs for reconciliation', () => {
  class FieldList extends Array { add(field) { this.push(field); } }
  const users = { name: 'users', fields: new FieldList(), indexes: [] };
  let saved;
  const app = {
    findCollectionByNameOrId(name) { assert.equal(name, 'users'); return users; },
    save(value) { saved = value; },
  };
  const context = createContext({ app, TextField: class { constructor(data) { Object.assign(this, data); } }, migrate(up) { up(app); } });
  new Script(legacyUserIdMigration).runInContext(context);
  assert.equal(saved, users);
  assert.equal(users.fields[0].name, 'legacy_user_id');
  assert.equal(users.fields[0].max, 80);
  assert.match(users.indexes[0], /idx_users_legacy_user_id/);
});

test('hooks parse and register the explicit business endpoints with auth middleware', () => {
  const routes = [];
  const hooks = [];
  const context = createContext({
    routerAdd(method, path, handler, middleware) { routes.push({ method, path, handler, middleware }); },
    onRecordAuthRequest(handler, collection) { hooks.push({ handler, collection }); },
    onRecordViewRequest(handler, collection) { hooks.push({ handler, collection, event: 'view-request' }); },
    onRecordCreateRequest(handler, collection) { hooks.push({ handler, collection, event: 'create-request' }); },
    onRecordUpdateRequest(handler, collection) { hooks.push({ handler, collection, event: 'update-request' }); },
    onFileDownloadRequest(handler, collection) { hooks.push({ handler, collection, event: 'file-download' }); },
    $apis: { requireAuth(collection) { return collection; }, requireSuperuserAuth() { return '_superusers'; } },
  });
  for (const file of readdirSync(join(root, 'pb_hooks'))) {
    const script = new Script(source('pb_hooks/' + file), { filename: file });
    if (file.endsWith('.pb.js')) script.runInContext(context);
  }
  assert.ok(routes.length >= 31);
  assert.ok(routes.filter((route) => route.middleware === 'users').length >= 26);
  assert.equal(routes.find((route) => route.path === '/api/lab/apply').middleware, undefined);
  assert.ok(hooks.some((hook) => hook.collection === 'users' && !hook.event));
  for (const path of [
    '/api/lab/applications/{id}/review', '/api/lab/apply-team', '/api/lab/members/{id}/active', '/api/lab/members/{id}/reset-password', '/api/lab/password',
    '/api/lab/project-assets/{id}', '/api/lab/project-assets/{id}/file', '/api/lab/project-assets/{id}/offline', '/api/lab/projects', '/api/lab/projects/{id}', '/api/lab/projects/{id}/assets', '/api/lab/projects/{id}/offline', '/api/lab/resources', '/api/lab/resources/{id}', '/api/lab/resources/{id}/status', '/api/lab/resources/{id}/file', '/api/lab/resources/{id}/offline', '/api/lab/site', '/api/lab/teams/{id}',
    '/api/lab/admin/announcements', '/api/lab/admin/announcements/{id}', '/api/lab/admin/announcements/{id}/offline', '/api/lab/admin/memberships', '/api/lab/admin/memberships/{id}/revoke', '/api/lab/admin/memberships/{id}/restore',
  ]) assert.ok(routes.some((route) => route.middleware === 'users' && route.path === path), `missing authenticated route ${path}`);
  assert.ok(routes.some((route) => route.method === 'GET' && route.path === '/api/lab/resources/{id}' && route.middleware === undefined));
  assert.equal(routes.find((route) => route.path === '/api/lab/site-seed').middleware, '_superusers');
  assert.ok(hooks.some((hook) => hook.collection === 'resource_contents' && hook.event === 'view-request'));
  assert.ok(hooks.some((hook) => hook.collection === 'project_assets' && hook.event === 'file-download'));
  assert.ok(hooks.some((hook) => hook.collection === 'resource_contents' && hook.event === 'file-download'));
});

test('version records the isolated platform verification without implying production readiness', () => {
  const version = JSON.parse(source('version.json'));
  assert.equal(version.version, '0.40.5');
  assert.equal(version.status, 'isolated-verified-darwin_arm64');
  assert.equal(version.binaryPlatform, 'darwin_arm64');
  assert.match(version.binarySha256, /^[0-9a-f]{64}$/);
  assert.match(version.releaseAssetChecksums.darwin_arm64, /^[0-9a-f]{64}$/);
  assert.match(version.status, /^isolated-verified-/);
});

test('deployment examples use executable systemd paths and multipart headroom', () => {
  const service = source('../deploy/pocketbase.service.example');
  const nginx = source('../deploy/pocketbase.nginx.example');
  assert.doesNotMatch(service, /\$\{PB_DATA_DIR\}/);
  assert.match(service, /--dir=\/srv\/car-lab\/data\/pb_data/);
  assert.match(nginx, /Content-Security-Policy/);
  assert.match(nginx, /client_max_body_size 32m;/);
});

test('rate-limit migration protects public application and login routes', () => {
  let saved;
  const settings = { rateLimits: { enabled: false, excludedIPs: [], rules: [] } };
  const app = {
    settings() { return settings; },
    save(value) { saved = value; },
  };
  const context = createContext({ app, migrate(up, rollback) { up(app); } });
  new Script(rateLimitMigration).runInContext(context);
  assert.equal(saved.rateLimits.enabled, true);
  assert.equal(JSON.stringify(saved.rateLimits.rules), JSON.stringify([
    { label: 'POST /api/lab/apply', audience: '@guest', duration: 60, maxRequests: 5 },
    { label: 'POST /api/collections/users/auth-with-password', audience: '@guest', duration: 60, maxRequests: 10 },
  ]));
});

test('resource visibility migration hides administrator-only summaries', () => {
  let saved;
  const resources = { name: 'resources', listRule: 'old', viewRule: 'old' };
  const app = {
    findCollectionByNameOrId(name) { assert.equal(name, 'resources'); return resources; },
    save(value) { saved = value; },
  };
  const context = createContext({ app, migrate(up) { up(app); } });
  new Script(visibilityMigration).runInContext(context);
  assert.match(saved.listRule, /visibility != "admin"/);
  assert.match(saved.listRule, /@request\.auth\.role = "admin"/);
  assert.equal(saved.viewRule, saved.listRule);
});
