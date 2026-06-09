# leverx stack (indexer + keeper)

Single container runs:

- **leverx-indexer** — Sui checkpoint ingestion, Postgres migrations, Prometheus on `:9186`
- **keeper** — HTTP API (`:3001`) and optional settlement cron

Postgres runs as a separate compose service.

## Quick start

```bash
cp keeper/.env.example keeper/.env
# Set KEEPER_PRIVATE_KEY; edit keeper/src/config/constants.ts for deploy IDs

docker compose up --build
```

App:

```env
VITE_LEVERX_INDEXER_URL=http://localhost:3001
```

## Ports

| Port | Service                                            |
| ---- | -------------------------------------------------- |
| 3001 | Keeper HTTP (`/health`, indexer routes, `/settle`) |
| 9186 | Indexer Prometheus metrics                         |
| 5432 | Postgres (optional host access)                    |

## Build only

```bash
docker compose build leverx
```

Build context is the repo root; first build compiles the Rust indexer (Sui git deps) and may take several minutes.
