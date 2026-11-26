# syntax=docker/dockerfile:1.7
# Frontend: React compilado con Vite, servido por nginx, que además hace de proxy hacia la API (/api).
# Contexto de build: 6-Codigo-Fuente-Proyecto/.

FROM node:22-alpine AS build
WORKDIR /web
COPY plataforma/web/package.json plataforma/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY plataforma/web/ ./
RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=8080 API_INTERNA=http://api:8000 MAIA_ENTORNO=local
COPY infra/docker/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY infra/docker/web/40-config-js.sh /docker-entrypoint.d/40-config-js.sh
COPY --from=build /web/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-config-js.sh && rm -f /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/config.js >/dev/null || exit 1
