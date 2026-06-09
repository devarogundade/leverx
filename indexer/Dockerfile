# LeverX indexer + read API. Build from repo root:
#   docker build -f indexer/Dockerfile -t devarogundade/leverx-indexer .

FROM rust:1.90.0 AS builder

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

FROM debian:trixie-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl libpq5 postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /work/target/release/leverx-indexer /opt/leverx/bin/leverx-indexer
COPY --from=builder /work/target/release/leverx-server /opt/leverx/bin/leverx-server
COPY indexer/entry.sh /entry.sh

RUN chmod +x /opt/leverx/bin/leverx-indexer /opt/leverx/bin/leverx-server /entry.sh

WORKDIR /opt/leverx

EXPOSE 3100 9184

ENV RUST_BACKTRACE=1
ENV RUST_LOG=info
ENV LEVERX_API_PORT=3100
ENV METRICS_PORT=9184

ENTRYPOINT ["/entry.sh"]
