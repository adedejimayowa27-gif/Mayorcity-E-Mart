# Mayorcity E-Mart

A campus marketplace web app for buying, selling, and reporting lost & found items. Built by **Adedeji Mayowa**.

## Stack

- Pure HTML / CSS / JavaScript (no framework, no build step)
- **Supabase** — auth, Postgres database, and file storage
- Static file server: `node generate-config.js` (writes `src/config.js` from env vars, then serves `src/` on port 5000)

## Running the project

The workflow **"Start application"** handles everything:

```
node generate-config.js
```

This reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ADMIN_EMAIL` from Replit Secrets, writes `src/config.js`, then starts serving on port 5000.

## Required Replit Secrets

| Secret | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon/public key |
| `ADMIN_EMAIL` | Email of the first admin account (optional but recommended) |

## First-time database setup

Before the app can load listings, run the full schema in Supabase:

1. Open your Supabase project → **SQL Editor** → **New query**
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run**

> The schema creates all tables, RLS policies, triggers, and storage buckets in one shot. Safe to re-run (uses `CREATE IF NOT EXISTS` / `ALTER … IF NOT EXISTS`).

**If the database already exists** (schema was applied previously), run only the migration block at the top of the `LISTINGS` section in `schema.sql` — the three `ALTER TABLE … ADD COLUMN IF NOT EXISTS` lines that add `lost_or_found`, `location`, and `date_lost_found`.

You also need to grant the anon role insert access for Lost & Found reports. Run this separately in the SQL Editor:

```sql
GRANT INSERT ON public.listings TO anon;
```

## Project structure

```
src/
  index.html     — full page markup (includes L&F modal)
  style.css      — all styles
  script.js      — all application logic
  config.js      — auto-generated from env vars; do not edit manually
  admin.html     — admin dashboard (role-gated)
  admin.js       — admin dashboard logic
  admin.css      — admin dashboard styles
supabase/
  schema.sql     — full DB schema (run once in Supabase SQL Editor)
generate-config.js — startup script (reads secrets → writes config.js → starts server)
```

## Key features

- **Marketplace listings** — verified students can post For Sale items
- **Lost & Found** — anyone (logged in or not) can report a lost or found item; reports appear immediately without admin approval
- Full Supabase Auth: sign up with student verification, sign in, forgot password, email confirmation
- Role-based access: `user` / `moderator` / `admin` with RLS on all tables
- Admin dashboard (`/admin.html`) for reviewing verifications, managing users & listings
- Image upload (listing images + student IDs) stored in Supabase Storage
- Seller trust profiles: ratings, verification badge, sales count

## Architecture notes

- `src/config.js` is generated at startup — never commit real credentials here.
- RLS is the security boundary; the anon key is intentionally public.
- Lost & Found posts use `type = 'Lost'` in the shared `listings` table, with extra columns `lost_or_found` (Lost/Found), `location`, and `date_lost_found`.

## User preferences

- Keep existing UI layout and feature set intact when making changes.
- Do not restructure the project or migrate to a different stack.
- Explain significant changes before applying them.
