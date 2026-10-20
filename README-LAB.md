# Lab platform (port 8081)

This Vue / Node site separates public team descriptions from approved-team resources and
maintainable project results.
The Node service stores accounts, applications, sessions, project records and published text resources in
SQLite at `LAB_DB_PATH` (default: `./data/lab.sqlite`). Never put private files in
`public/` or `dist/`, and back up the SQLite database before upgrades.

Run `npm install`, `npm test`, `npm run build`, then `npm run dev:server` and
`npm run dev` in separate terminals. Vite proxies `/api` to port 3000.

`npm test` includes the legacy SQLite platform tests and the read-only migration
preflight tests. Run `npm run test:migration` when reviewing an approved,
脱敏的 SQLite copy. The preflight never imports data and always reports
`readyForImport: false` until the PocketBase target and rollback evidence have
been verified separately.

The authorized migration writer is `npm run migration:import -- <sqlite-copy>`.
It defaults to a sanitized dry-run report; add `--apply` only with a fixed,
isolated PocketBase target and a short-lived superuser token. It never imports
legacy password hashes or sessions. Imported accounts remain inactive until an
administrator completes identity verification and uses the controlled password
reset route documented in `docs/migration-import.md`.

The `pocketbase/` directory is an isolated candidate for the documented
migration. The frontend adapter supports explicit PocketBase selection for local
verification; the default runnable path remains Node/SQLite and production
service routing remains unchanged. PocketBase data, downloaded binaries, and
backups stay outside Git and must not be placed under `public/` or `dist/`.

The `/projects` page reads published project records from the selected backend. A new
Node database automatically seeds the nine archived 2026 showcase projects from
`public/projects/xiaoxueqi-2026/showcase-site/data.json`; PocketBase uses the explicit
`npm run pocketbase:seed-projects -- --apply` initialization command. The admin workspace
can create, edit, reorder and take projects offline while preserving legacy media paths.
On the default Node backend, administrators can also manage controlled project assets:

- `GET /api/projects/:ref/assets` lists published, available public assets.
- `GET /api/admin/projects/:ref/assets` lists all assets for administrators.
- `POST /api/admin/projects/:ref/assets` creates a legacy reference or uploads a file.
- `PATCH /api/admin/project-assets/:id` edits label, source, visibility and order.
- `POST /api/admin/project-assets/:id/file` replaces an uploaded file.
- `POST /api/admin/project-assets/:id/offline` logically removes an asset from public output.
- `POST /api/admin/members/:id/reset-password` sets a 10–128 character temporary password for a student account, activates it, invalidates existing sessions and writes an audit event.

Uploaded project files are stored below the SQLite data directory in `project-files/`, never
under `public/` or `dist/`. The 30 MiB limit and image/video/document MIME allowlist are
enforced by the server; public pages only receive assets that belong to a published project
and are both available and published. PocketBase project metadata and binary project-asset
flows are validated in the isolated candidate. The candidate is still not connected to the
default frontend or production service. As confirmed on 2026-10-18, videos and result
documents can be added online from `/admin` → “项目成果” → “受控项目素材”, then
explicitly published. Historical originals are not required for local feature acceptance;
administrators can add them later, and bulk historical-media migration is optional.

Team descriptions are stored in the Node `teams` table and seeded from the current
public defaults on first startup. `GET /api/teams` supplies the navigation, home page,
team detail pages and application choices; administrators can edit a team through
`/api/admin/teams/:id` from the “团队内容” workspace. Updates are audited as
`team.update` and disabled teams disappear from public navigation and applications.

News and notices use a separate `announcements` table and public routes:
`GET /api/announcements` lists published items, and
`GET /api/announcements/:slug` reads a published detail. Administrators manage draft,
published and offline states from the “新闻公告” workspace; announcement bodies are
plain text and are recorded in audit logs without copying the body into metadata.

Each member can hold independent `team_memberships`. The original `users.team` field
remains the default display team for compatibility, while team resource access requires
an active, approved membership for the resource team. Logged-in members can submit a
second-team application through `POST /api/apply-team`; administrators review it through
the normal application flow and can revoke or restore a membership from the admin
workspace.

前端 API adapter 支持显式切换到已验证的隔离 PocketBase：

```sh
VITE_PLATFORM_BACKEND=pocketbase VITE_POCKETBASE_URL=http://127.0.0.1:18082 npm run dev
```

默认值为 `node`。切换只影响当前构建产物，不会自动启动服务、迁移数据或改变生产代理。

隔离部署与回滚说明见 `docs/deployment-and-rollback.md`。`npm run test:rollback`
只演练临时目录恢复，不代表生产恢复已经验证。

容量冒烟只读请求的默认目标是本机 Node 服务，且默认拒绝远端地址。先在隔离服务上设置目标规模后运行：

```sh
CAPACITY_REQUESTS=200 CAPACITY_CONCURRENCY=16 npm run capacity:smoke
```

输出中的 p50、p95、最大延迟和失败请求只能作为隔离环境证据；生产容量仍需按真实账号规模、附件大小和磁盘配额现场复验。

Create the first administrator on the server once, as the service user:

```sh
printf '%s\n' 'REPLACE_WITH_STRONG_PASSWORD' | node server/bootstrap-admin.js admin@example.org
```

The password is read from stdin, never a CLI argument. Do not commit it. The
administrator signs in at `/portal`, reviews membership and publishes real
text resources. Public resource summaries are discoverable; private bodies
are served only to an approved member of the same team or the administrator.
Password changes invalidate every existing session for that account.

Student registration requires a unique 11-digit student number and a name.
Username and application statement are optional. If supplied, a username uses
3–30 lowercase ASCII characters, starts with a letter, and may contain letters,
numbers, `_`, `-`, or `.`. Student passwords and member
password changes require at least 10 characters. The first two student-number
digits are stored as the grade label, such as `25` becoming `25级`.

In production, set `LAB_REQUIRE_HTTPS=1`. The HTTPS virtual host must proxy
`/api` directly to `127.0.0.1:18081` with `X-Forwarded-Proto: https`;
the public HTTP 8081 virtual host must not be used for authenticated requests.
The existing site and database remain independent of port 8080.

## Static publication checks

After uploading a build from Windows, make **only the public build tree** readable
by Nginx: run `bash deploy/fix-static-permissions.sh` on the production host.
Directories under `/srv/site-8081/www` require mode 755 and files require mode 644.
Do not apply these permissions to `/srv/site-8081/data` or private uploads.

Run `python deploy/verify-public-assets.py https://v2xb6205.nemotoken.fun` after
every release. A page returning HTTP 200 is insufficient: the referenced JavaScript
must return a JavaScript MIME type and stylesheets must return `text/css`.
Follow with a browser render check, including the lazy-loaded assignments route.
