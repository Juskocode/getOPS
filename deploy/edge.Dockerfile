FROM node:24-alpine AS builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY legacy ./legacy
RUN npm run build

FROM nginx:1.28.3-alpine3.23

COPY deploy/nginx-main.conf /etc/nginx/nginx.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /build/legacy/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "--quiet", "--tries=1", "--spider", "http://127.0.0.1:8080/api/health/live"]

ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
