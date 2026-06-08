# leverx indexer (Rust) + keeper (NestJS) in one image.
# Build from repo root: docker compose build leverx

FROM rust:1.90.0 AS indexer-builder

ARG PROFILE=release
WORKDIR /work

COPY indexer/Cargo.lock indexer/Cargo.toml ./
COPY indexer/crates ./crates/

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    build-essential libssl-dev pkg-config curl cmake clang ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.cargo/bin:${PATH}"

RUN cargo build --profile "$PROFILE" --bin leverx-indexer --bin leverx-server \
    --config net.git-fetch-with-cli=true

FROM node:22-bookworm-slim AS keeper-builder

WORKDIR /build

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY keeper/package.json keeper/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY keeper/tsconfig.json keeper/tsconfig.build.json keeper/nest-cli.json ./
COPY keeper/src ./src

RUN pnpm run build \
    && pnpm prune --prod

FROM debian:trixie-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates curl libpq5 postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=indexer-builder /work/target/release/leverx-indexer /opt/mysten/bin/leverx-indexer
COPY --from=indexer-builder /work/target/release/leverx-server /opt/mysten/bin/leverx-server
COPY --from=keeper-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=keeper-builder /build/dist /opt/leverx/keeper/dist
COPY --from=keeper-builder /build/node_modules /opt/leverx/keeper/node_modules
COPY --from=keeper-builder /build/package.json /opt/leverx/keeper/package.json
COPY docker/leverx-stack/entry.sh /entry.sh

RUN chmod +x /opt/mysten/bin/leverx-indexer /opt/mysten/bin/leverx-server /entry.sh

WORKDIR /opt/leverx/keeper

EXPOSE 3001 3100 9186

CMD ["/entry.sh"]
