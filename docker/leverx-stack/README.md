# leverx stack (indexer + keeper)

Single container runs:

- **leverx-indexer** — Sui checkpoint ingestion, Postgres migrations, Prometheus on `:9186`
- **keeper** — LeverX-operated HTTP API (`:3001`), manager relay, and BullMQ-scheduled maintenance tasks (Redis-backed)

Postgres and Redis run as separate compose services.

## Quick start

```bash
cp keeper/.env.example keeper/.env
# Set KEEPER_PRIVATE_KEY; edit keeper/src/config/constants.ts for deploy IDs

docker compose up --build
```

App:

```env
VITE_LEVERX_KEEPER_URL=http://localhost:3001
VITE_LEVERX_INDEXER_WS_URL=ws://localhost:3100/v1/ws
```

Keeper proxies REST `/v1/*` only — WebSocket live streams must point at leverx-server (`:3100`).

After contract deploy, admin must set `keeper_address` on the Leverx registry to the keeper signer.

## Ports

| Port | Service                                            |
| ---- | -------------------------------------------------- |
| 3001 | Keeper HTTP (`/health`, indexer routes, `/settle`) |
| 9186 | Indexer Prometheus metrics                         |
| 5432 | Postgres (optional host access)                    |
| 6379 | Redis (BullMQ job queue; optional host access)     |

## Build only

```bash
docker compose build leverx
```

Build context is the repo root; first build compiles the Rust indexer (Sui git deps) and may take several minutes.
