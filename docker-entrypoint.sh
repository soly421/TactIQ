#!/bin/sh
# TactIQ container entrypoint.
#
# When a replica bucket is configured (LITESTREAM_BUCKET + credentials),
# Litestream restores the database on a fresh disk (disaster recovery /
# migration to a new instance) and then continuously streams every change
# off-site while the server runs — forwarding signals so a deploy or restart
# does a clean shutdown with a final sync. When no bucket is configured (local
# dev, or a deploy before backups are wired), the server just runs directly.
set -e

DB="${DATABASE_PATH:-/data/tactiq.db}"
SERVER="node server/dist/index.js"

if [ -n "$LITESTREAM_BUCKET" ] && [ -n "$LITESTREAM_ACCESS_KEY_ID" ]; then
  echo "[entrypoint] Litestream backup ENABLED — bucket=$LITESTREAM_BUCKET db=$DB"
  # Restore only when the local DB is missing (a fresh/empty volume) and a
  # replica actually exists — a normal restart keeps the live disk untouched.
  litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$DB" \
    || echo "[entrypoint] nothing to restore (first boot or empty replica) — continuing"
  # Replicate continuously and run the server as Litestream's child.
  exec litestream replicate -config /etc/litestream.yml -exec "$SERVER"
else
  echo "[entrypoint] Litestream NOT configured (LITESTREAM_BUCKET unset) — running WITHOUT continuous backup"
  exec $SERVER
fi
