# Postgres Migration (DigitalOcean + Docker)

This project now uses PostgreSQL in Prisma (`datasource db { provider = "postgresql" }`).

Use this runbook to move from the existing SQLite file (`prisma/dev.db`) to DigitalOcean Managed PostgreSQL with minimal downtime.

## 1) Create a managed Postgres database in DigitalOcean

1. In DigitalOcean: `Databases` -> `Create Database` -> `PostgreSQL`.
2. Pick region near your droplet.
3. Add your droplet to trusted sources (network access).
4. Copy the connection string (`DATABASE_URL`), typically with `sslmode=require`.

Example:

```bash
DATABASE_URL='postgresql://doadmin:***@db-postgresql-nyc3-12345-do-user-1234567-0.l.db.ondigitalocean.com:25060/defaultdb?sslmode=require'
```

## 2) Backup your current SQLite DB from Docker

On your droplet:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}"
docker cp <app_container_name>:/app/prisma/dev.db /tmp/loomi-dev.db
ls -lh /tmp/loomi-dev.db
```

Adjust `/app` if your container uses a different app path.

## 3) Deploy code with Postgres support

Deploy this branch and set `DATABASE_URL` in your container env/secrets to the DigitalOcean Postgres URL.

## 4) Create schema in Postgres

Run once in the app container (or one-off task container with app code):

```bash
npx prisma generate
npx prisma db push
```

## 5) Copy data SQLite -> Postgres

Ensure `sqlite3` is installed in the environment where you run the migration script:

```bash
sqlite3 --version
# if missing on Ubuntu/Debian:
apt-get update && apt-get install -y sqlite3
```

Run the one-off migration script:

```bash
SQLITE_SOURCE_PATH=/tmp/loomi-dev.db \
DATABASE_URL='<your_digitalocean_postgres_url>' \
npm run db:migrate:sqlite-to-postgres
```

Optional full overwrite of target data:

```bash
TRUNCATE_TARGET=true \
SQLITE_SOURCE_PATH=/tmp/loomi-dev.db \
DATABASE_URL='<your_digitalocean_postgres_url>' \
npm run db:migrate:sqlite-to-postgres
```

## 6) Verify core tables

Use `psql` or any Postgres client:

```sql
SELECT COUNT(*) FROM "User";
SELECT COUNT(*) FROM "Account";
SELECT COUNT(*) FROM "Template";
SELECT COUNT(*) FROM "AccountEmail";
```

## 7) Cutover

1. Restart app containers with Postgres `DATABASE_URL`.
2. Verify login, accounts page, and contacts/campaign pages.
3. Keep `/tmp/loomi-dev.db` backup until stable.

## Notes

- SQLite tooling like DBeaver is no longer required once on Postgres.
- For direct table inspection/editing after migration:
  - `psql` in terminal, or
  - DBeaver/TablePlus connected to DigitalOcean Postgres.
