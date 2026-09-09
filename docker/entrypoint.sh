#!/usr/bin/env bash
#
# What the application container does before it serves anything: bring the
# dependencies in step with the lockfile, raise the schema, then build once and
# start. Every step is idempotent, so `docker compose restart app` is cheap and
# `docker compose up` on a cold machine is the same command.
set -euo pipefail

cd /app

BUILD_DIR="${NEXT_BUILD_DIR:-.next}"

if [ "${KCLUB_DOCKER_INSTALL:-1}" = "1" ]; then
  echo "[kclub] installing dependencies..."
  pnpm install --frozen-lockfile --prefer-offline
fi

echo "[kclub] preparing the database..."
pnpm exec tsx tools/docker-bootstrap.ts

# NEXT_PUBLIC_* are inlined at build time, so the build has to see the same
# base URL the server answers on - the same property tools/e2e-env.ts documents.
if [ ! -f "${BUILD_DIR}/BUILD_ID" ] || [ "${KCLUB_DOCKER_BUILD:-0}" = "1" ]; then
  echo "[kclub] building (this takes a few minutes the first time)..."
  KCLUB_SKIP_DB_PRERENDER=1 pnpm exec next build
fi

echo "[kclub] serving on http://localhost:${PORT:-3000}"
exec pnpm exec next start --port "${PORT:-3000}" --hostname 0.0.0.0
