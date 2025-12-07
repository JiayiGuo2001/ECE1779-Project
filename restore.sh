#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file>"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[restore] Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

CONTAINER_NAME="${CONTAINER_NAME:-ticket_tracker_db}"
DB_NAME="${DB_NAME:-ticket_tracker}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"

echo "[restore] Restoring '${BACKUP_FILE}' into database '${DB_NAME}' in container '${CONTAINER_NAME}'"

# 1. empty public schema
docker exec -e PGPASSWORD="${DB_PASSWORD}" "${CONTAINER_NAME}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# 2. load backup
docker exec -e PGPASSWORD="${DB_PASSWORD}" -i "${CONTAINER_NAME}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" < "${BACKUP_FILE}"

echo "[restore] Done."
