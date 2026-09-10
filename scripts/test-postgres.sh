#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
CONTAINER_NAME="getops-postgres-it-$$"
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:17-alpine}

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run -d --rm \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_USER=getops \
  -e POSTGRES_PASSWORD=getops \
  -e POSTGRES_DB=getops \
  -p 127.0.0.1::5432 \
  -v "$ROOT_DIR/db/migrations:/docker-entrypoint-initdb.d:ro" \
  "$POSTGRES_IMAGE" >/dev/null

attempt=1
while [ "$attempt" -le 60 ]; do
  if docker exec "$CONTAINER_NAME" pg_isready -U getops -d getops >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    docker logs "$CONTAINER_NAME"
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

PORT=$(docker port "$CONTAINER_NAME" 5432/tcp | sed -n 's/.*://p' | head -n 1)
if [ -z "$PORT" ]; then
  printf 'Could not determine disposable PostgreSQL port.\n' >&2
  exit 1
fi

cd "$ROOT_DIR"
npm run api:build
GETOPS_TEST_DATABASE_URL="postgresql://getops:getops@127.0.0.1:${PORT}/getops" \
  ctest --test-dir services/api/build --output-on-failure -R getops.repository_integration
