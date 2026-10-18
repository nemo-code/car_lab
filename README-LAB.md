# Lab platform (port 8081)

This Vue / Node site separates public team descriptions from approved-team resources.
The Node service stores accounts, applications, sessions and published text resources in
SQLite at `LAB_DB_PATH` (default: `./data/lab.sqlite`). Never put private files in
`public/` or `dist/`, and back up the SQLite database before upgrades.

Run `npm install`, `npm test`, `npm run build`, then `npm run dev:server` and
`npm run dev` in separate terminals. Vite proxies `/api` to port 3000.

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
Username and application statement are optional. Student passwords and member
password changes require at least 6 characters. The first two student-number
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
