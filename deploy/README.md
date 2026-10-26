# Despliegue en el VPS (Hetzner) con Docker + Caddy, detras de Cloudflare

Estado: preparado, NO desplegado. La web sigue en Vercel hasta que se cambie el DNS.

## Requisitos en el servidor (una vez)
1. Anadir swap de 2 GB (el servidor no tiene): `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` y una linea en `/etc/fstab`.
2. Instalar Docker y el plugin compose.
3. Clonar este repositorio en `/opt/athletics-frontend`, copiar `deploy/env.example` a `deploy/.env` y rellenarlo con los mismos valores que en Vercel (usuario y clave del sitio, rol `serving_ro`, certificado PEM).
4. `ufw allow 80,443/tcp`. Cuando la web este migrada: cerrar 5432 al exterior y permitir solo la red de Docker: `ufw allow from 172.16.0.0/12 to any port 5432` y `ufw delete allow 5432/tcp`.

## Desplegar / actualizar
`cd /opt/athletics-frontend && ./deploy/deploy.sh`

La construccion usa la red del servidor (`network: host`) porque Next consulta Postgres al generar paginas.

## Cloudflare
- Dominio ya anadido (nameservers de Cloudflare en Hostinger). Cuando la web este en el VPS: registros `A` (raiz) y `CNAME www` a la IP del servidor, nube naranja, SSL/TLS en **Full (strict)**.
- Mientras siga en Vercel los registros van en "DNS only" (nube gris).

## Notas
- `APP_ENV=production` replica el cierre por defecto que en Vercel daba `VERCEL_ENV`.
- Las paginas con `revalidate` usan la cache de archivos de Next dentro del contenedor: se pierde al reconstruir y se rehace sola.
- Copia de seguridad y alarmas: las de Postgres ya existen; para la web basta el healthcheck `/api/health` (ya consultado por Cloud Monitoring).
