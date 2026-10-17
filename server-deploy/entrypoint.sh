#!/bin/sh
set -eu
: "${CRM_ACCESS_PASSWORD:?CRM_ACCESS_PASSWORD is required}"
export CI=true WRANGLER_SEND_METRICS=false
mkdir -p /data
run_step() {
  set +e
  timeout 45s "$@"
  code=$?
  set -e
  if [ "$code" -ne 0 ] && [ "$code" -ne 124 ]; then return "$code"; fi
}
run_step wrangler d1 migrations apply DB --local --persist-to /data --config /app/wrangler.jsonc
if [ ! -f /data/.crm_data_imported ]; then
  run_step wrangler d1 execute DB --local --persist-to /data --config /app/wrangler.jsonc --file /app/import.sql
  touch /data/.crm_data_imported
fi
set -- wrangler dev --config /app/wrangler.jsonc --local --persist-to /data --ip 0.0.0.0 --port 3000 --var "CRM_ACCESS_PASSWORD:${CRM_ACCESS_PASSWORD}"
if [ -n "${AMAP_JS_KEY:-}" ]; then set -- "$@" --var "AMAP_JS_KEY:${AMAP_JS_KEY}"; fi
if [ -n "${AMAP_SECURITY_JS_CODE:-}" ]; then set -- "$@" --var "AMAP_SECURITY_JS_CODE:${AMAP_SECURITY_JS_CODE}"; fi
exec "$@"

