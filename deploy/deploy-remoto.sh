#!/usr/bin/env bash
# Publica la web en el VPS SIN pasar por Vercel. Se ejecuta EN TU ORDENADOR, dentro del repo, con todo commiteado:
#   ./deploy/deploy-remoto.sh
# Sube el commit actual (git archive) a /opt/athletics-frontend, construye la imagen en el servidor y reinicia solo la web.
# El fichero deploy/.env del servidor (claves) NO se toca: no esta en git.
set -euo pipefail
cd "$(dirname "$0")/.."
SSH_KEY="${SSH_KEY:-$HOME/.ssh/hetzner_athletics}"
HOST="${HOST:-root@91.98.3.76}"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "Hay cambios sin commitear: haz commit antes de desplegar."; exit 1; fi
echo "Subiendo $(git rev-parse --short HEAD)..."
git archive HEAD | ssh -i "$SSH_KEY" "$HOST" 'tar -x -C /opt/athletics-frontend'
ssh -i "$SSH_KEY" "$HOST" 'cd /opt/athletics-frontend/deploy && set -a && . ./.env && set +a && docker compose build && docker compose up -d web caddy && docker compose ps'
echo "Hecho. Comprueba: https://athleticsinforanking.com/api/health"
