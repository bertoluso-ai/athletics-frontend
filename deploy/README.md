# Despliegue en el VPS (Hetzner) con Docker + Caddy, detras de Cloudflare

Estado: DESPLEGADO. La web de produccion corre en el VPS (contenedor `deploy-web-1`, Docker + Caddy, detras de Cloudflare). Vercel ya no se usa.

## Requisitos en el servidor (una vez)
1. Anadir swap de 2 GB (el servidor no tiene): `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` y una linea en `/etc/fstab`.
2. Instalar Docker y el plugin compose.
3. Clonar este repositorio en `/opt/athletics-frontend`, copiar `deploy/env.example` a `deploy/.env` y rellenarlo con los valores de produccion (usuario y clave del sitio, rol `serving_ro`, certificado PEM).
4. `ufw allow 80,443/tcp`. Cuando la web este migrada: cerrar 5432 al exterior y permitir solo la red de Docker: `ufw allow from 172.16.0.0/12 to any port 5432` y `ufw delete allow 5432/tcp`.

## Desplegar / actualizar
Desde el ordenador, con todo commiteado (el `git push` solo lanza el CI, no despliega):
`./deploy/deploy-remoto.sh`

Sube el commit actual con `git archive` a `/opt/athletics-frontend`, construye la imagen en el servidor y reinicia solo `web` y `caddy`. Despues comprobar `https://athleticsinforanking.com/api/health`.

Alternativa, en el propio VPS: `cd /opt/athletics-frontend && ./deploy/deploy.sh` (necesita `git pull`, y la carpeta del servidor no es un repo git).

La construccion usa la red del servidor (`network: host`) porque Next consulta Postgres al generar paginas.

## Cloudflare
- Dominio ya anadido (nameservers de Cloudflare en Hostinger). Registros `A` (raiz) y `CNAME www` a la IP del servidor, nube naranja, SSL/TLS en **Full (strict)**.

## Notas
- `APP_ENV=production` activa el cierre por defecto del sitio (usuario y clave en `proxy.ts`). El `noindex` solo se quita con `SITE_PUBLIC=1`, a proposito.
- `.env.production.local` en local es una copia vieja de Vercel (apunta a la Cloud SQL parada): para `next build` local forzar `PG_SERVING_HOST=91.98.3.76` por variable de entorno.
- Las paginas con `revalidate` usan la cache de archivos de Next dentro del contenedor: se pierde al reconstruir y se rehace sola.
- Copia de seguridad y alarmas: las de Postgres ya existen; para la web basta el healthcheck `/api/health` (ya consultado por Cloud Monitoring).
