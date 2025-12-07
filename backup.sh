#!/usr/bin/env bash
set -euo pipefail

# Default config
CONTAINER_NAME="${CONTAINER_NAME:-ticket_tracker_db}"
DB_NAME="${DB_NAME:-ticket_tracker}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date +'%Y%m%d-%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql"

echo "[backup] Dumping database '${DB_NAME}' from container '${CONTAINER_NAME}'"
echo "[backup] Output file: ${BACKUP_FILE}"

# run pg_dump
docker exec -e PGPASSWORD="${DB_PASSWORD}" "${CONTAINER_NAME}" \
  pg_dump \
    --clean \
    --if-exists \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
  > "${BACKUP_FILE}"

echo "[backup] Done."
