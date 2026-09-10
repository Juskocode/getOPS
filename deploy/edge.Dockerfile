FROM node:24-alpine AS builder

WORKDIR /build
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts
COPY content ./content
COPY legacy/web ./legacy/web
RUN npm run contracts:build \
    && npm run web:build \
    && LEGACY_BASE_PATH=/legacy npm run legacy:build

FROM nginx:1.28.3-alpine3.23

COPY deploy/nginx-main.conf /etc/nginx/nginx.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /build/apps/web/dist /usr/share/nginx/html
COPY --from=builder /build/legacy/dist /usr/share/nginx/html/legacy

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080/api/health/live"]

ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
