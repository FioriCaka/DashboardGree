# Gree Node/React/Postgres Migration

This folder is a full-stack replacement for the original `laravel-app` using:

- React + Vite for the admin dashboard.
- Node.js + Express for the API.
- PostgreSQL for storage.
- JWT bearer auth, role checks, soft deletes, upload placeholders, and CRUD modules matching the Laravel app domains.

The original Laravel folder is left untouched so behavior can be compared during migration.

## Setup

```bash
npm install
copy server\.env.example server\.env
```

Update `server/.env` with your PostgreSQL connection string.

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

Default seeded accounts use password `asdasdasd`:

- `admin@example.com`
- `test@example.com`
- `tech@example.com`
- `seller@example.com`
- `client@example.com`

## Compatibility Notes

The API keeps Laravel-like routes under `/api`, including `/api/login`, `/api/profile`, `/api/products`, `/api/tasks`, `/api/inspections`, `/api/tickets`, `/api/complaints`, `/api/clients`, `/api/news`, `/api/sales`, `/api/reports`, and `/api/users`.

Soft-deleted records use `deleted_at` instead of physical deletion, matching Laravel behavior. File uploads are stored under `server/uploads`; production should move this to object storage.
