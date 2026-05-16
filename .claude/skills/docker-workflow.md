# Docker Workflow

## Start toàn bộ stack

```bash
docker compose up --build
```

Services:
- `mindlex-postgres` — PostgreSQL 16 (port 55432 trên host)
- `mindlex-backend` — ASP.NET Core API (port 8080)
- `mindlex-frontend` — React SPA served by nginx (port 3000)

## Chỉ start database

```bash
docker compose up postgres
```
Useful khi muốn chạy backend/frontend locally ngoài Docker.

## Rebuild single service

```bash
docker compose up --build backend
docker compose up --build frontend
```

## Xem logs

```bash
docker compose logs -f backend
docker compose logs -f postgres
```

## Reset database

```bash
docker compose down -v
docker compose up --build
```
`-v` xóa volume `mindlex_pgdata` → database fresh.

## Environment variables

File `.env` ở project root (copy từ `.env.example`):
- `JWT_SECRET` — >= 32 chars (production)
- `STRIPE_SECRET` / `STRIPE_WEBHOOK_SECRET` — Stripe keys
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — seeded admin account
- `POSTGRES_HOST_PORT` — host port cho PostgreSQL (default 55432)
- `VITE_API_BASE_URL` — frontend API base (default `/api`)
- `NUGET_FEED_URL` / `NUGET_USERNAME` / `NUGET_PAT` — private NuGet feed (nếu DainnUser/DainnStripe packages ở private feed)

## Debug connection issues

Backend không connect được PostgreSQL:
1. Check `docker compose ps` — postgres healthy?
2. Connection string trong compose dùng service name: `Host=postgres;Port=5432`
3. Local development dùng: `Host=localhost;Port=55432`

## Default credentials

- Admin: `admin@mindlex.local` / `Admin123!`
- PostgreSQL: `postgres` / `postgres` / database `mindlex`
