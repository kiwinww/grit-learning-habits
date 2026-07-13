#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${1:-/var/www/grit-learning-habits}"
KEEP_DAYS="${2:-14}"
SHARED_DIR="$APP_ROOT/shared"
BACKUP_ROOT="$APP_ROOT/backups/daily"
STAMP="$(date +%Y%m%d-%H%M%S)"
DESTINATION="$BACKUP_ROOT/$STAMP"

case "$APP_ROOT" in
  /var/www/grit-learning-habits|/var/www/grit-learning-habits-*) ;;
  *)
    echo "Unexpected APP_ROOT: $APP_ROOT" >&2
    exit 1
    ;;
esac

mkdir -p "$DESTINATION"

if [ -f "$SHARED_DIR/prisma/dev.db" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$SHARED_DIR/prisma/dev.db" ".backup '$DESTINATION/dev.db'"
  else
    cp -a "$SHARED_DIR/prisma/dev.db" "$DESTINATION/dev.db"
  fi
fi

if [ -d "$SHARED_DIR/public/uploads" ]; then
  tar -czf "$DESTINATION/uploads.tar.gz" -C "$SHARED_DIR/public" uploads
fi

if [ -f "$SHARED_DIR/.env" ]; then
  cp -a "$SHARED_DIR/.env" "$DESTINATION/.env"
  chmod 600 "$DESTINATION/.env"
fi

find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf -- {} +

echo "Backup created: $DESTINATION"
