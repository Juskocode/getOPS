FROM debian:bookworm-slim AS builder

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        git \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /source
COPY CMakeLists.txt ./
COPY services/api ./services/api

RUN cmake -S . -B /build \
      -DBUILD_TESTING=OFF \
      -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /build --parallel --target getops_api

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        ca-certificates \
        curl \
        libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 getops \
    && useradd --uid 10001 --gid getops --create-home --shell /usr/sbin/nologin getops

WORKDIR /app
COPY --from=builder /build/services/api/getops_api /app/getops_api
COPY content /app/content

USER 10001:10001
EXPOSE 8780

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=5 \
  CMD ["curl", "--fail", "--silent", "http://127.0.0.1:8780/api/v1/health/ready"]

ENTRYPOINT ["/app/getops_api"]
