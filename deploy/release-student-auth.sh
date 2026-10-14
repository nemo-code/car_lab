#!/usr/bin/env bash
set -Eeuo pipefail

base=/srv/site-8081
release="$base/releases/20261014-student-auth"
backup="$base/backups/20261014-student-auth"
domain=v2xb6205.nemotoken.fun
unit=car-lab.service

test -f "$release/dist/index.html"
test -f "$release/server/index.js"
test -f "$release/server/platform.js"
test ! -e "$backup"
install -d -m 700 "$backup"
changed=0

rollback() {
  trap - ERR
  echo '8081 release failed; restoring the backup' >&2
  if (( changed )); then
    systemctl stop "$unit" || true
    cp -a "$backup/data/." "$base/data/"
    cp -a "$backup/server/." "$base/server/"
    cp -a "$backup/www/." "$base/www/"
  fi
  systemctl start "$unit"
  exit 1
}
trap rollback ERR

systemctl stop "$unit"
cp -a "$base/data" "$backup/data"
cp -a "$base/server" "$backup/server"
cp -a "$base/www" "$backup/www"
changed=1

install -m 644 -o site8081 -g site8081 "$release/server/index.js" "$base/server/index.js"
install -m 644 -o site8081 -g site8081 "$release/server/platform.js" "$base/server/platform.js"
systemctl start "$unit"

ready=0
for attempt in {1..20}; do
  if systemctl is-active --quiet "$unit" && curl -fsS --max-time 2 http://127.0.0.1:18081/api/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" -eq 1

response=$(curl -fsS --max-time 5 --resolve "$domain:443:127.0.0.1" "https://$domain/api/me")
[[ "$response" == *'"data":null'* ]]

cp -a "$release/dist/." "$base/www/"
curl -fsS --max-time 5 --resolve "$domain:443:127.0.0.1" "https://$domain/portal?mode=apply" | grep -q '智能网联汽车实验室'
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/)" = 302
systemctl is-active --quiet "$unit"
trap - ERR
echo "8081 release complete; backup=$backup"
