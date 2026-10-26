# Despliegue en contenedor (VPS ARM/x86). Construccion en 3 pasos; la imagen final solo lleva el servidor autonomo de Next.js.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# El lock se genero en Windows y le faltan dependencias opcionales de Linux (@emnapi): si npm ci no cuadra, npm install las completa.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Las variables NEXT_PUBLIC_* se incrustan al construir: pasarlas como --build-arg.
ARG NEXT_PUBLIC_GTM_ID
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_ADSENSE_PUB
# Next pre-genera paginas que consultan Postgres al construir: se necesitan las credenciales de LECTURA solo en esta fase (no pasan a la imagen final).
ARG PG_SERVING_HOST
ARG PG_SERVING_USER
ARG PG_SERVING_PASSWORD
ARG PG_SERVING_CA
ENV PG_SERVING_HOST=$PG_SERVING_HOST PG_SERVING_USER=$PG_SERVING_USER PG_SERVING_PASSWORD=$PG_SERVING_PASSWORD PG_SERVING_CA=$PG_SERVING_CA
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
