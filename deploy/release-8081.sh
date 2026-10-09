#!/usr/bin/env bash
set -Eeuo pipefail

base=/srv/site-8081
release="$base/releases/20261008-lab-v1"
backup="$base/backups/20261008-lab-v1"
vhost=/etc/nginx/sites-available/v2xb6205.nemotoken.fun
unit=/etc/systemd/system/car-lab.service
domain=v2xb6205.nemotoken.fun

test -f "$backup/car-lab.service"
test -f "$backup/v2xb6205.nemotoken.fun"
test -f "$release/dist/index.html"

rollback() {
  trap - ERR
  echo 'Release failed; restoring the 8081 backup' >&2
  cp -a "$backup/server/." "$base/server/"
  cp -a "$backup/www/." "$base/www/"
  cp -a "$backup/car-lab.service" "$unit"
  cp -a "$backup/v2xb6205.nemotoken.fun" "$vhost"
  systemctl daemon-reload
  systemctl restart car-lab.service
  nginx -t && systemctl reload nginx
  exit 1
}
trap rollback ERR

install -d -m 700 -o site8081 -g site8081 "$base/data"
for file in index.js content.js platform.js bootstrap-admin.js; do
  install -m 644 -o site8081 -g site8081 "$release/server/$file" "$base/server/$file"
done
install -m 644 "$release/car-lab.service" "$unit"
install -m 644 "$release/v2xb6205.nemotoken.fun" "$vhost"
systemctl daemon-reload
nginx -t
systemctl restart car-lab.service
systemctl is-active --quiet car-lab.service
ready=0
for attempt in {1..20}; do
  if curl -fsS --max-time 2 http://127.0.0.1:18081/api/health >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" -eq 1
systemctl reload nginx
ready=0
for attempt in {1..20}; do
  response=$(curl -fsS --max-time 3 --resolve "$domain:443:127.0.0.1" "https://$domain/api/me" 2>/dev/null || true)
  if [[ "$response" == *'"data":null'* ]]; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" -eq 1

cp -a "$release/dist/." "$base/www/"
curl -fsS --resolve "$domain:443:127.0.0.1" "https://$domain/" | grep -q '智能网联汽车实验室'
curl -s -o /dev/null -w '8080_http=%{http_code}\n' http://127.0.0.1:8080/
echo '8081 release complete'
trap - ERR
