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

In production, set `LAB_REQUIRE_HTTPS=1`. The HTTPS virtual host must proxy
`/api` directly to `127.0.0.1:18081` with `X-Forwarded-Proto: https`;
the public HTTP 8081 virtual host must not be used for authenticated requests.
The existing site and database remain independent of port 8080.
