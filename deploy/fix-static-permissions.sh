#!/usr/bin/env bash
# Run after copying Windows-built dist files to the public web root.
# Only public build files are touched; data/uploads must stay private.
set -Eeuo pipefail
root=/srv/site-8081/www
test "$(readlink -f "$root")" = "$root"
test -f "$root/index.html"
find "$root" -type d -exec chmod 755 {} +
find "$root" -type f -exec chmod 644 {} +
