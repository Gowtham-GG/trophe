# Trophe

**Eat well, see clearly.** A personal food, calorie and diet tracker: log what you eat in seconds, see your calories
and macros against your goals, and follow your weight trend. (*Trophē*, Greek for nourishment.)

Trophe is the third app in a family:

| App | Tracks | Data lives in |
|---|---|---|
| [Argus](../Argus/argus) | money | `public` schema |
| [Mneme](../Mneme) | mind (notes, tasks, habits) | `mneme` schema |
| **Trophe** | food and body | `trophe` schema |

It's a web app (React + Vite, installable as a PWA) on **Supabase** (Auth + Postgres), hosted on **Vercel**. It shares
one Supabase project, and the same login, with Argus and Mneme. Data is private per user (Row Level Security), so it
is multi-user by construction even though it is built for personal use.

- **Free to run.** Supabase free tier, Vercel hobby tier, free food APIs. No paid services, no ads, no paywall.
- **No Edge Functions.** Supabase only does Auth and Postgres queries. Food search (Phase 2) calls Open Food Facts
  from the browser and USDA through a tiny Vercel function, so no Supabase compute is used.
- **Logic lives in Postgres** (the Mneme approach): totals, goals and trends are database functions, so every client
  (web now, Android later) gets the same numbers.
- **History never changes.** A diary entry keeps a copy of the food's nutrients at the moment it was logged.

---

## 1. Roadmap

| Phase | What you get | Status |
|---|---|---|
| 0. Foundation | Sign-in (shared account), Trophe. look and themes, dock navigation, settings, PWA, tests | **done** |
| 1. Diary | Today ring + macros, meals, custom foods & servings, recent/frequent, copy meals, saved meals, quick add, goal wizard, diary calendar | **done** |
| 2. Finding food | Search your foods → Indian dishes (bundled) → Open Food Facts → USDA; barcode scan; quick add (`2 roti dal lunch`); recipes | |
| 3. Body & progress | Weight with smoothed trend, water, measurements, weekly/monthly charts, streaks | |
| 4. Smart (no AI) | Adaptive calorie target from intake vs weight trend, insight cards, full-screen confirmations | |
| 5. Extras | Micronutrients, fasting timer, recipe import, meal plans & grocery lists, export, links to Mneme habits / Argus | |
| Deferred | AI meal logging, photo recognition, AI weekly report (would need Edge Functions) | not planned |

---

## 2. Architecture

```
 Web (React + TS + Vite + Tailwind, PWA) ── supabase-js ──▶ Supabase Auth (shared with Argus + Mneme)
                                                       └──▶ PostgREST ─▶ Postgres  schema `trophe`  (RLS on every table)
 Vercel = static hosting (+ one small function for USDA search in Phase 2)
```

```
src/
  api/          typed data layer (auth, settings, errors)
  lib/          pure logic + tests: env checks, timezone-aware dates, themes, meals
  contexts/     Auth, Settings (timezone + theme, saved to the account), Toast
  components/   Shell (top bar + floating dock), Card, Ring/MacroBar, Dialog, ThemePicker, BigT, Brand…
  pages/        Today (Home), Diary, Progress, Foods, Settings, Login
supabase/
  migrations/   versioned, idempotent, each in a transaction
  tests/        SQL test-suite (RLS / tenant isolation / coexistence) + Supabase shim + runner
tests/
  integration/  real client code ↔ real migrations via PostgREST (local, throwaway DB)
scripts/
  make-icons.py draws the "T." app icons (npm run icons)
```

The UI is Mneme's "executive glass" design system (`src/index.css`, `src/lib/themes.ts`): same glass surfaces, dock
and 15 themes. Trophe defaults to **Jade** so the three apps are easy to tell apart.

---

## 3. Database

Schema **`trophe`** (nothing is created in `public` or `mneme`). Every table has `user_id uuid default auth.uid()
references auth.users on delete cascade` and one RLS policy `user_id = (select auth.uid())` (USING + WITH CHECK).
`revoke all on schema trophe from public, anon`; only `authenticated` gets access.

| Table | Purpose |
|---|---|
| `settings` | timezone (decides what "today" means), theme, body profile (sex, birth year, height, activity). Created lazily by the app's first upsert |
| `foods` | your foods: name, brand, source, nutrients **per 100 g** (kcal, protein, carbs, fat; optional fibre, sugar, sodium), `archived_at` |
| `food_servings` | "1 roti = 40 g", "1 katori = 150 g" per food |
| `diary_entries` | day (local), meal, food, grams, how it was entered (`2 × 1 roti`), and **its own copy of the nutrients** |
| `goals` | kcal + macros + fibre from `effective_from`; a day is judged by the goal in force then |
| `weigh_ins` | one weight per day (the goal wizard records it; trend in Phase 3) |
| `meal_templates`, `meal_template_items` | saved meals ("usual breakfast") |

**History never changes.** `diary_before_write` copies the food's nutrients into the entry when it's logged. Editing
or deleting the food later leaves past days as they were; changing an entry's grams rescales its own copy. An entry
without a food is a quick add (typed calories).

**RPCs** (all `SECURITY INVOKER`, RLS applies): `day_summary(day)` (goal, totals, per meal), `range_summary(from, to)`
(per day + verdict: empty / logged / under < 90 % / on / over > 110 % of that day's goal), `recent_foods(meal)`,
`frequent_foods(meal)` (with last amount, for one-tap re-logging), `search_foods(query)`, `copy_entries(from, to, meal,
to_meal)`, `save_meal_template(name, day, meal)`, `log_meal_template(id, day, meal)`, `goal_for(day)`.

---

## 4. Coexistence with Argus and Mneme (read before touching the database)

* Argus owns `public`, Mneme owns `mneme`. Trophe creates **nothing** outside `trophe` and never modifies their objects.
* Same Auth users. Trophe adds **no** trigger on `auth.users` (Argus's `handle_new_user` keeps working).
* The browser session uses its own storage key (`trophe-auth`), so the apps don't overwrite each other's sessions.
* **Never run `supabase db reset`, `db pull` or `db diff` against the shared project.** Use `db push` (only Trophe's
  files) or paste migrations into the SQL editor.
* Free tier: 500 MB database shared by all three apps. Trophe stores only what you log; food search results are
  never bulk-imported.

---

## 5. Setup

### 5.1 Apply the migrations (once)

```
20261022100000_trophe_01_schema.sql     schema, grants
20261022100100_trophe_02_settings.sql   settings table, RLS
20261022110000_trophe_03_foods.sql      foods, servings, body profile on settings
20261022110100_trophe_04_goals.sql      goals (by start date), weigh-ins, goal_for()
20261022110200_trophe_05_diary.sql      diary entries (copied nutrients), saved meals
20261022110300_trophe_06_rpc.sql        day/range summaries, recent/frequent, search, copy, saved-meal RPCs
20261022120000_trophe_07_anon_functions.sql  no function executable by anon/PUBLIC (see its header)
```

**Option A – SQL editor:** paste each file, in order, into *SQL Editor → New query → Run*.
**Option B – CLI** (after `supabase link --project-ref <your-project-ref>`, the SAME project as Argus):

```bash
supabase db query --linked -f supabase/migrations/<file>.sql    # each new file, in order
```

**Not `supabase db push`.** The shared project's migration history holds Mneme's entries, so `db push` from this
folder stops with *"Remote migration versions not found in local migrations directory"*. Never follow its suggested
fix (`migration repair --status reverted …` / `db pull`): that would erase Mneme's history and pull other apps'
schemas in here. Trophe's migrations are idempotent and are not recorded in that history table (recording them would
break Mneme's own `db push` the same way). Applied so far: 01–07 (2026-10-22).

**Every migration that creates a function must end with** `revoke execute on all functions in schema trophe from
public, anon;` and `grant execute on all functions in schema trophe to authenticated;`. Postgres grants new
functions to PUBLIC and Supabase adds a project-wide grant to anon; per-schema default privileges can't undo either.
The SQL suite fails if any function is left callable by anon.

### 5.2 Expose the schema (once, manual)

Dashboard → **Settings → API → Exposed schemas** → add **`trophe`** (keep `public` and `mneme`) → Save.
Without this every request fails with a *schema not exposed* error.

### 5.3 Auth URLs

Dashboard → **Authentication → URL Configuration → Redirect URLs**: add your Trophe URL(s), e.g.
`https://trophe.vercel.app` and `http://localhost:5173`. Leave the *Site URL* alone. Sign-up and password reset pass
`redirectTo` so emails return to Trophe.

### 5.4 Environment variables

| Variable | Where | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env.local` + Vercel | `https://<project-ref>.supabase.co` (same as Argus/Mneme) |
| `VITE_SUPABASE_ANON_KEY` | `.env.local` + Vercel | the public **anon** key (same as Argus/Mneme) |

```bash
cp .env.example .env.local   # then fill in the two values
```

The **service-role key is never used and must never be added** (the app refuses to start with it).

### 5.5 Run locally

```bash
npm install
npm run dev          # http://localhost:5173 — sign in with your Argus/Mneme account
```

---

## 6. Deploy to Vercel

1. Push the repo to Git, then in Vercel: **Add New → Project → Import**. Framework preset: **Vite**.
2. Add the two env vars from 5.4 (Production + Preview).
3. Deploy. `vercel.json` has the SPA rewrite and hardened headers (strict **Content-Security-Policy**: `connect-src`
   allows only `*.supabase.co`, no inline scripts, camera/mic/location off; plus `nosniff` and referrer policy).
   Phase 2 will add Open Food Facts to `connect-src` and allow the camera for barcode scanning.
4. Add the deployed URL to Supabase **Redirect URLs** (5.3).

---

## 7. Testing

```bash
npm test          # unit tests (vitest): env checks, dates/timezones, themes, meals, nutrition maths, amounts
npm run test:sql  # SQL suite in a throwaway local Postgres (needs initdb/pg_ctl/psql)
npm run test:int  # integration: real API code + real migrations through PostgREST (needs podman or docker)
npm run lint && npm run build
```

* **SQL suite** (`supabase/tests/trophe_tests.sql`, rolled back at the end): settings defaults and checks, upsert
  behaviour, food checks, nutrient copying and history staying fixed, goals by date, range verdicts, recent/frequent,
  search, copying and saved meals, a **tenant-isolation matrix** (user B cannot read, update, delete, create or take over user A's rows),
  anon has no access, and coexistence checks (no trigger on `auth.users`, nothing in `public`, RLS on every table).
  The runner also applies every migration twice to prove they are idempotent. It never touches your Supabase project.
* **Integration** (`npm run test:int`): `initdb/pg_ctl`, `psql`, `podman` (or `CONTAINER_CLI=docker`) and network
  access once for the PostgREST image.
* **Local stack for browser checks** (`bash tests/integration/stack.sh`): the same Postgres + PostgREST, left running
  on `127.0.0.1:54331` so a dev server can point at it (`VITE_SUPABASE_URL=http://127.0.0.1:54331`).

---

## 8. Icons

`npm run icons` redraws `public/favicon.png`, `icon-192/512.png`, `icon-maskable-512.png` and `apple-touch-icon.png`
(the "T." mark in Jade, same geometry as the login letterform). To use your own artwork, replace those files and
keep the names.
