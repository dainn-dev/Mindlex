# Mindlex — Docker Compose dev environment

Bring up Postgres + ASP.NET Core backend + React/Vite frontend (served via
nginx) with one command. Frontend talks to backend via `/api` proxied
through nginx — no CORS hassle for local dev.

## Prerequisites

- Docker Desktop (Windows / macOS) or Docker Engine + Compose v2 (Linux).
- ~4 GB free disk for images + Postgres volume.
- (Optional) Access credentials to the private NuGet feed that hosts
  `DainnStripe` / `DainnUser.*` packages. Without these, the backend image
  build will fail at `dotnet restore`.

## Quick start

```bash
# 1. Copy env template and fill in secrets you have (others can stay blank).
cp .env.example .env
# Edit .env in your editor — at minimum set JWT_SECRET and the NUGET_* vars
# if Dainn* packages are private.

# 2. Build + start the whole stack.
docker compose up --build

# 3. Open:
#    Frontend:        http://localhost:3000
#    Backend Swagger: http://localhost:8080/swagger
#    Postgres:        localhost:5432  (user=postgres / pwd=postgres / db=mindlex)
```

First boot is slow (~3-5 min) because both images compile from source.
Subsequent `docker compose up` should be < 30s thanks to layer caching.

## Verifying it's running

- `docker compose ps` → all 3 services should show **healthy** after ~30s.
- Hit `http://localhost:8080/swagger` → Swagger UI loads, you can test
  any of the 9 controllers.
- Hit `http://localhost:3000` → React app loads. Routes like
  `/login`, `/register` should render. `/chatbot` requires login.

## Commands

```bash
# Tail logs
docker compose logs -f backend
docker compose logs -f frontend

# Reset DB (drop volume — fresh schema next boot via EF migrations).
docker compose down -v
docker compose up --build

# Rebuild just the backend after .cs changes:
docker compose up --build backend

# Rebuild just the frontend after .tsx changes:
docker compose up --build frontend

# Stop everything but keep data:
docker compose down
```

## Environment variables (`.env`)

| Key | Purpose | Default |
|---|---|---|
| `NUGET_FEED_URL` | Private NuGet v3 index URL for Dainn* packages | blank |
| `NUGET_USERNAME` | NuGet feed username | blank |
| `NUGET_PAT` | NuGet feed personal access token | blank |
| `JWT_SECRET` | JWT signing key (>= 32 chars in prod) | dev placeholder |
| `STRIPE_SECRET` | Stripe API secret key | blank (billing flows disabled) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | blank |
| `VITE_API_BASE_URL` | Frontend → backend base URL baked at build | `/api` |

## Architecture

```
[browser] → :3000 (nginx) ──┬── static SPA (Vite build)
                            └── /api/* proxied → backend:8080 (ASP.NET 8)
                                                       │
                                                       ▼
                                                  postgres:5432
                                                  (mindlex_pgdata volume)
```

## Adding Ollama (LLM) later

When you wire LLM, append to `docker-compose.yml`:

```yaml
  ollama:
    image: ollama/ollama:latest
    container_name: mindlex-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_models:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

volumes:
  ollama_models:
```

Then point backend at it via env:
```
Mindlex__Llm__BaseUrl: http://ollama:11434/v1/
Mindlex__Llm__Model:   gemma3:12b
```

## Troubleshooting

**`dotnet restore` fails with `Unable to load the service index`**
→ NuGet feed needs auth. Fill `NUGET_FEED_URL` / `NUGET_USERNAME` / `NUGET_PAT`
in `.env`. If packages should be public, double-check package names exist
on nuget.org.

**Backend exits with `Could not connect to database`**
→ Postgres healthcheck not green yet. `docker compose up` will retry on
restart. Check `docker compose logs postgres`.

**Frontend builds but shows blank page / 404 on routes**
→ nginx SPA fallback may have been removed. Check `frontend/nginx.conf`
has `try_files $uri $uri/ /index.html;` in `location /`.

**Frontend → Backend CORS errors**
→ You shouldn't hit any — nginx proxies `/api` same-origin. If you do,
make sure FE was built with `VITE_API_BASE_URL=/api` (default).
