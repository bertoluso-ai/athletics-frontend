#!/usr/bin/env bash
# Ejecutar EN EL VPS, dentro de la carpeta del repo: ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .git ] && git pull --ff-only || echo '(sin git: codigo subido a mano)'
cd deploy
test -f .env || { echo "Falta deploy/.env (copiar de env.example)"; exit 1; }
set -a; . ./.env; set +a
# la construccion lee la base: usa el Postgres local por la red del host
export PG_SERVING_HOST=127.0.0.1
docker compose build
docker compose up -d
docker compose ps
