# PocketBase 0.40.5 Runtime Validation

Date: 2026-10-18 (Asia/Shanghai)

## Online video and result upload acceptance (2026-10-18, Asia/Tokyo)

The user confirmed that videos and result documents can be added online; historical
originals are not required for local acceptance. The administrator instructions now
describe uploading, explicitly publishing, replacing and taking these assets offline.

On branch `refactor/p0-lab-upgrade`, HEAD `c3ba5458a201bc12b04bd8e9e3f9934665c30ffc`
plus the uncommitted worktree, the following gates passed after extending the existing
browser flow:

- `npm test`: 76 passed, 0 failed.
- `npm run build`: passed.
- `npm run browser:e2e`: passed against a temporary Node/SQLite instance at 390px.
- `npm run browser:pocketbase-e2e`: passed against temporary PocketBase 0.40.5 data
  with the verified macOS arm64 executable selected via `POCKETBASE_BINARY`.
- Both browser runs uploaded a valid one-second H.264 MP4 and a valid one-page PDF,
  published them through the administrator UI, checked anonymous `200` responses,
  matching MIME types and exact file bytes, and decoded the uploaded video's frames.
  After taking each asset offline through the UI, its former URL returned `404` and
  the public project detail hid both links.
- `git diff --check`: passed.

The fixtures contain only synthetic content and total 2,187 bytes. These results cover
the local online-upload flow; no production import, deployment or media migration was
performed.

## Reverification of the current local worktree (2026-10-18)

The following gates were rerun on macOS arm64 with Node.js v26.5.0, branch
`refactor/p0-lab-upgrade`, based on the current local worktree. The worktree was
intentionally left uncommitted; these results describe local files, not a commit
or production deployment. Linux-specific results are recorded below.

- `npm test`: 76 passed, 0 failed, including the loopback-only capacity smoke contract.
- `npm run build`: passed.
- `npm audit --package-lock-only --omit=dev --audit-level=high`: passed with 0 vulnerabilities.
- `npm run browser:e2e`: passed on the Node backend at 390px, covering
  registration, review, member team filtering, content editing, project and
  announcement lifecycle, upload retry, second-team authorization, and resource access.
- `npm run browser:pocketbase-e2e`: passed on the isolated PocketBase 0.40.5
  backend at 390px with the same core business-flow coverage, including member
  team filtering.
- `scripts/browser-smoke.mjs`: passed 40 desktop/mobile route-and-viewport visits
  against a temporary Node SQLite database and Vite server, with no HTTP or
  browser errors.
- `npm run browser:pocketbase-smoke`: passed 40 desktop/mobile visits and the
  isolated API permission flow: approved-resource download returned `200`,
  invalidated sessions returned `404`, member role escalation returned `403`,
  and the protected-file token expired as configured.
- `CAPACITY_REQUESTS=200 CAPACITY_CONCURRENCY=16 npm run capacity:smoke`: passed
  200 read-only requests against a temporary Node/SQLite service; all returned
  `200`, p50 was `6.66ms`, p95 was `14.49ms`, and the maximum was `27.56ms`.
- `npm run verify:pocketbase-migration`: passed with synthetic SQLite data;
  first import wrote 18 records, the repeat wrote 0, an imported account was
  reset and authenticated, and the restored Protected attachment was readable.
- `npm run verify:pocketbase-project-assets`: passed in a fresh isolated
  instance; project create/edit/offline, metadata and multipart assets,
  missing legacy paths rejected before publication, replacement-unpublish
  behavior, public file access, offline `404`, and superuser-versus-business-admin
  authorization all matched the contract.
- `npm run test:rollback`: passed the temporary previous-release restore drill.
- `git diff --check`: passed after recording this verification.

All servers, browser profiles, SQLite files, PocketBase data, and uploaded test
files used in these checks were temporary and removed after each run. Production
data import, deployment, domain/proxy cutover, and production backup restoration
remain unverified and outside this local verification.

All commands below ran in a dedicated isolated PocketBase runtime directory.
No production data, port 8080 service, or main worktree was changed.

## Binary

- Asset: `pocketbase_0.40.5_darwin_arm64.zip`
- Source: GitHub release `v0.40.5`
- `pocketbase --version`: `0.40.5`
- Release ZIP SHA-256: `d9a176e0491bc825fff88c2a4edffb07307f785ac2bd9710e82c5d223669fc17`
- Extracted executable SHA-256: `420d4c192368646c2209ba67c6b741de4a47b2550576dd6676228f6d5c97374c`
- Verification: `node scripts/verify-pocketbase.mjs <asset>` checks the release ZIP checksum; the extracted executable checksum is recorded separately in `pocketbase/version.json`.
- The isolated runtime flow checks both `pocketbase --version` and the platform-bound executable SHA-256 before starting PocketBase.

## Linux ARM64 isolated runtime validation

On 2026-10-18, the migration/recovery flow and the project-assets flow were
rerun inside a
`linux/arm64` `node:26-bookworm` container with the fixed PocketBase 0.40.5
Linux ARM64 executable. The executable reported version `0.40.5` and SHA-256
`86e6a863386091b502068a58edd0f3c3b95f8fd5bd97dc00ec9c7199ec70835e`.

The run returned `pass: true`: the synthetic source remained byte-for-byte
unchanged; the first import wrote 18 records; the idempotent repeat wrote 0;
the imported account password reset and re-login succeeded; and the restored
database retained all relations and the Protected attachment
(`protectedFileRead: true`). The run used temporary data and a synthetic SQLite
fixture only.

The Linux project-assets run also returned `pass: true`: project create/edit/
offline, legacy and multipart asset metadata, replacement, public file access,
offline `404`, and superuser-versus-business-admin authorization all passed.

## Backup and restore runtime drill

`npm run verify:pocketbase-migration` was extended to validate backup and restore
using the real PocketBase 0.40.5 database and file storage, not placeholder
files. The isolated flow imports a synthetic SQLite fixture, creates a temporary
business administrator and a published public resource, uploads a Protected PDF,
stops PocketBase, and snapshots the complete data directory. It restores that
snapshot into a separate temporary directory, starts a second PocketBase process,
and verifies every migrated collection count and relation, business login, the
resource body, and byte-for-byte download of the Protected PDF. The latest run
returned `pass: true`: the source had 4 users, 4 applications and 3 resources;
the imported target had 3 teams, 4 users, 4 memberships, 4 applications, 3
resources and 3 resource-content records. The repeated import wrote 0 records.
The restore included five manifest files and storage; after adding the recovery
fixture it verified 3 teams, 5 users, 4 memberships, 4 applications, 4 resources
and 4 resource-content records, with relations enabled and
`protectedFileRead: true`. The verification waits for each PocketBase process to
exit before removing its temporary directory.

This is a local recovery rehearsal with synthetic records. It does not validate
a production backup or deployment cutover. The backup CLI's
`--source-stopped` option remains an operator assertion; the runtime verification
stops its isolated PocketBase process before creating the snapshot.

## Migration findings

The unmodified candidate migration does not start on a new PocketBase 0.40.5
directory. It fails with:

```text
failed to apply migration 1792195200_lab_schema.js: name: Collection name must be unique (case insensitive).
```

PocketBase 0.40.5 creates an auth collection named `users` in an empty data
directory. The isolated repair reuses that collection, adds custom fields via
PocketBase field constructors, makes the built-in `email` field optional, and
explicitly locks the users collection create/update/delete rules.

When rules are staged with null values before related collections exist, rule
strings must be converted with `String(value)` before the final `app.save()`.
Passing the Goja string wrapper back directly causes PocketBase 0.40.5 to store
the rules as `NULL` without failing the migration.

The repaired migration starts successfully in a new data directory, reuses the
built-in `users` auth collection, creates the remaining eight lab collections and
three seed teams, and stores non-null rules. The resulting schema therefore has
nine lab collections in total when `users` is included.

The isolated main worktree also serves URL-encoded Chinese public asset paths
correctly through the Node rollback server after its static path decoder was
tightened.

## API and access-control checks

- `/api/health`: `200`
- `/api/lab/apply` without email: `201` after making the auth email field optional
- application review: `200`
- member login after approval: `200`
- same-team approved member reads team content through GET /api/lab/resources/{id}: `200`
- second-team approved membership reads the matching team content through the controlled route: `200`
- direct resource_contents list/view for team content: `200` with totalItems=0 / `404`
- cross-team approved member reads team content through the controlled route: `404`
- pending member can log in to view application state, but reads no team content (`totalItems=0`)
- anonymous protected-content list: `200` with `totalItems=0`
- anonymous Protected file URL: `404`
- `POST /api/files/token` for an authenticated admin: `200`
- Protected file with admin token: `200`
- Protected file replacement invalidates the old filename URL and serves the replacement: `200`
- Protected file with cross-team member token: `404`
- Protected file after matching membership revoke: `404`
- Protected file with pending member token: `404`
- Protected file with an invalid/expired-shaped token: `404`
- disabling a member: `200`
- disabled member login: `403`
- disabled member's old token viewing the account: `404`
- disabled member's old Protected file token: `404`
- public application rate limit: first five requests `201`, then `429` within the same minute
- password login rate limit: first ten invalid attempts `400`, then `429` within the same minute
- administrator-only resource summaries are absent from anonymous and member listings; direct reads return `404`/`403` as appropriate, while an administrator can list and read them

## Administrator write and audit checks

The standard record model hooks in PocketBase 0.40.5 do not provide a reliable
request context for this use case. Sensitive writes are locked at collection
rule level; the frontend therefore uses authenticated custom routes:

- `PATCH /api/lab/site`: `200`, updates `site_pages` and writes `site.update`.
- `POST /api/lab/resources`: `201`, creates `resources` and `resource_contents`, and writes `resource.create`.
- `PATCH /api/lab/resources/{id}`: `200`, updates both records and writes `resource.update`.
- `GET /api/lab/resources/{id}`: `200` for a published public resource, or for a published team resource when the caller has an active approved membership; unauthorized team and administrator-only reads return `404`.
- `POST /api/lab/resources/{id}/file`: `200`, stores a PDF through the protected file field and writes `resource.file`.
- `POST /api/lab/resources/{id}/offline`: `200`, marks a resource offline and writes `resource.offline`.
- `POST /api/lab/projects`: `201`, creates a project record and writes `project.create`.
- `PATCH /api/lab/projects/{id}`: `200`, updates project metadata and writes `project.update`.
- `POST /api/lab/projects/{id}/offline`: `200`, marks a project offline and writes `project.offline`.
- `POST /api/lab/site-seed`: `200`, initializes all ten site sections with a superuser token.

The isolated run confirmed audit records contain the action, target, metadata,
and authenticated administrator record ID. Standard collection endpoints remain
read paths for the frontend. Initial preparation may use the `site-seed` route
and the `seed-pocketbase-projects.mjs` command with a short-lived superuser token;
routine business content writes use authenticated custom routes with audit records.

No PocketBase serve errors, invalid-rule errors, or panics were observed after
the isolated migration repair.

The application settings migration `1792195300_rate_limits.js` was applied on a
fresh PocketBase 0.40.5 directory. The settings endpoint reported both
guest-only rules, and live HTTP checks returned the expected `429` responses.

## FILE-02

On a fresh isolated PocketBase 0.40.5 instance, `npm run verify:pocketbase-files`
returned a sanitized result with a valid PDF stored (`200`), an HTML upload
rejected by the MIME allowlist (`400`), and a 30 MiB plus one byte PDF rejected
by the file-size limit (`400`). The command uses temporary public fixture
resources and marks them offline before exiting; it does not print credentials
or file contents. Its `POCKETBASE_BUSINESS_TOKEN` must be a short-lived
`users.role=admin` token. A `_superusers` token is rejected by the controlled
business route and must not be substituted for this variable.

## P1-01 project_assets runtime flow

`npm run verify:pocketbase-project-assets` is self-contained and runs only
against a temporary data directory. It resolves the fixed PocketBase version
from `pocketbase/version.json` (or uses `POCKETBASE_BINARY`), creates a temporary
`_superusers` account only to initialize the isolated instance, then obtains a
separate `users.role=admin` business token. The verification asserts that the
superuser token is rejected by the business project route (`403`) before using
the business token for all project and asset mutations.

The flow creates and edits a project while preserving legacy media references,
creates a metadata-only legacy asset, uploads a multipart image, reads its
public file URL, replaces it and confirms replacement cancels publication,
republishes the replacement, then takes it offline and confirms the old file
URL returns `404`. It also verifies that an offline project disappears from the
public project and asset views. The command emits only status/count fields and
removes its temporary data directory on exit.

The same isolated run creates a published public resource, uploads a PDF, and
confirms its anonymous content lookup and direct file URL both return `200`
before the fixture is taken offline.

## P0 flow verification

`npm run verify:pocketbase-flow` runs the API flow against the PocketBase URL
and superuser token supplied in `POCKETBASE_URL` and `POCKETBASE_ADMIN_TOKEN`;
it does not start or select an isolated target itself. For a self-contained
temporary target, use `npm run browser:pocketbase-smoke`, which seeds the fresh
PocketBase directory, runs this API flow, and then performs the browser checks.
The flow covers three team
applications, administrator review, duplicate-review rejection, pending-member
login, same-team/cross-team/pending Protected content checks, tokenized and
anonymous file downloads, cross-team and pending file-token rejection, site
content editing with audit, direct collection write rejection, member
disablement, old account/file-token invalidation, and disabled-login rejection.
The negative authorization checks also cover `AUTH-05` (a member's direct
`role=admin` write is rejected and the role remains `member`), `APP-03` (a
member cannot review a pending application and it remains `pending`), and `RES-07` (anonymous and
authenticated requests to `/pb_data` return `403` or `404`). The command uses
generated fixture identities and emits only status/count fields.

The latest isolated rerun after adding these checks returned `pass: true` with
`memberRejected: 403`, `memberRoleWrite: 403`, `memberRoleAfterWrite: member`,
`pbDataAnonymous: 404`, and `pbDataMember: 404`. The run used a new temporary
PocketBase data directory and removed it after completion.

The flow also publishes an announcement through the authenticated administrator
route, then verifies anonymous list and detail reads against the public Hooks.
`npm run browser:pocketbase-smoke` runs this API flow against its own temporary
PocketBase 0.40.5 directory before visiting all public routes plus member/admin
guards at 1440px and 390px. The matching Node/SQLite browser smoke passed with a
temporary database and Vite dev server: 40 desktop/mobile route visits at 1440px
and 390px, including `/team`, `/contact`, and case-variant compatibility paths.
Its temporary database and both local processes were removed after the run; the
PocketBase browser smoke also passed 40 route/viewport visits.

The default Node backend now returns `nosniff`, referrer, frame and CSP headers;
it adds HSTS only when `LAB_REQUIRE_HTTPS=1` and the reverse proxy confirms HTTPS.
Project image uploads must match their declared image MIME, extension and file
signature. Project images may render inline; non-image project assets and all
resource attachments are served as downloads. Tests also cover an HTML payload
declared as plain text and reject an HTML payload forged as PNG. These are local
Node responses; the production Nginx static-root response headers remain a
separate deployment configuration check.

The current isolated API run also verifies that changing a member password and
admin-resetting it each invalidate the prior user JWT and previously issued
Protected-file token immediately (`404`), then confirms reauthentication with
the new password works. Ordinary users' direct `role=admin` update attempts are
rejected (`403`) and the stored role remains `member`. These checks run on the
macOS arm64 binary only.

The users collection migration sets `fileToken.duration` to 120 seconds; its
rollback restores PocketBase 0.40.5's 180-second default. The isolated
`browser:pocketbase-smoke` flow checks natural expiration after its other
authorization checks: it temporarily sets the isolated collection duration to
10 seconds, confirms a newly issued Protected-file token downloads the fixture with
`200`, waits past the token's decoded `exp`, then confirms the same URL returns
`404`. The flow first verifies the migration's 120-second value, then reports
`configuredDurationSeconds: 120`, `testDurationSeconds: 10`, `beforeExpiry: 200`,
`afterExpiry: 404`, and `expiredNaturally: true`. This verifies RES-06 for the
synthetic file and temporary PocketBase 0.40.5 instance; it does not verify a
production database or another PocketBase release/platform.

The Node rollback backend has a matching regression test for administrator-only
resources: the resource is visible in the administrator directory, hidden from
anonymous and ordinary member directories, and inaccessible through the detail
route unless the caller is an administrator.

## P1-01 project seed and management

The static 2026 showcase was seeded into an isolated PocketBase 0.40.5 instance
with `npm run pocketbase:seed-projects`. The command was run three times against
the same empty target:

- dry-run: 9 records planned, 9 creates, 0 updates;
- first `--apply`: 9 records, 9 created, 0 updated;
- second `--apply`: 9 records, 0 created, 9 updated.

The public `projects` collection returned 9 published records after seeding. The
seed preserves `legacy_id`, edition, slug, display order, image paths, and the
original video/document references. Missing historical files remain metadata
only; the seed does not create dead download links. The Node fallback database
also seeds the same nine records on first initialization.

The Node admin project routes are covered by contract tests for create, edit,
listing unpublished records, taking a project offline, and managing controlled
project assets while writing the corresponding audit actions. The Vue admin
workspace is wired to the Node adapter and exposes metadata, historical references,
upload, replacement and logical offline actions. The isolated PocketBase
`project_assets` flow now also validates binary upload, direct-file authorization,
replacement, republish and offline behavior. This remains a candidate backend
validation and is not a production migration or cutover.

## Remaining integration requirements

As confirmed on 2026-10-18, project videos and result documents are accepted through
the administrator's online upload, publication and offline flow. Historical video/document
originals are not a local feature blocker; administrators can add them later. Bulk media
migration is optional and is separate from any production data import or cutover.

The historical SQLite import remains a separate authorized operation. The
worktree includes a deterministic preflight/plan, a controlled PocketBase import
writer, controlled site and project seed commands, and the Node fallback
implementation. Synthetic SQLite data has been imported and restored against an
isolated PocketBase target; no production accounts or passwords were imported.
Production backup/restore rehearsal and a real deployment cutover remain outside
the isolated validation performed here. The
new local backup/restore drill uses a real PocketBase database and Protected
attachment but synthetic data and temporary directories only.
