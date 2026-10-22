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
| 2. Finding food | Online search (Open Food Facts + USDA), Indian dishes, quick add by typing (`2 roti dal lunch`), barcode scan, recipes | **done** |
| 3. Body & progress | Weight with smoothed trend, water, measurements, weekly/monthly charts, streaks, weekdays vs weekends | **done** |
| 4. Smart (no AI) | Adaptive calorie target from intake vs weight trend, insight cards **done**; full-screen confirmations | in progress |
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
| `weigh_ins` | one weight per day (logged on Progress; the goal wizard records it too) |
| `measurements` | one row per day: waist, hips, chest, neck, arm, thigh (cm), body fat % — any of them |
| `water_entries` | each glass of water (day, ml), so the last one can be taken back; the goal is `settings.water_goal_ml` |
| `meal_templates`, `meal_template_items` | saved meals ("usual breakfast") |
| `recipe_items` | a recipe's ingredients (a recipe is a food with source `recipe`, plus its cooked weight and portions) |

**History never changes.** `diary_before_write` copies the food's nutrients into the entry when it's logged. Editing
or deleting the food later leaves past days as they were; changing an entry's grams rescales its own copy. An entry
without a food is a quick add (typed calories).

**RPCs** (all `SECURITY INVOKER`, RLS applies): `day_summary(day)` (goal, totals, per meal), `range_summary(from, to)`
(per day + verdict: empty / logged / under < 90 % / on / over > 110 % of that day's goal), `recent_foods(meal)`,
`frequent_foods(meal)` (with last amount, for one-tap re-logging), `search_foods(query)`, `copy_entries(from, to, meal,
to_meal)`, `save_meal_template(name, day, meal)`, `log_meal_template(id, day, meal)`, `goal_for(day)`,
`save_external_food(food, servings)`, `quick_log_foods()` (every active food with servings and last amount),
`save_recipe(id, name, items, cooked_g, portions)`, `weight_trend(from, to)`, `weight_summary()`, `water_range(from, to)`,
`nutrition_periods(from, to, week|month)`, `nutrition_stats(from, to)`, `streaks(today)`, `maintenance_estimate(today)`, `insights(today)`.

### Online food search

`api/food-search.ts` is a Vercel function (Vercel free tier — no Supabase compute). It searches **Open Food Facts**
(packaged foods, many Indian brands; data under ODbL, credited in the app) and **USDA FoodData Central** (ingredients;
public domain) in parallel and returns both in Trophe's per-100 g shape (`src/lib/external.ts`, unit-tested against
real responses in `tests/fixtures/`).

* Only signed-in users get answers: the function checks the caller's Supabase token (`/auth/v1/user`), so nobody
  else can spend the USDA quota. Results are public data, so complete answers are CDN-cached for a day.
* Open Food Facts allows ~10 searches a minute, so the app searches online only after a 0.7 s pause (or on Enter).
* Search results are never stored. Picking one calls `save_external_food()`, which copies it (and its servings) into
  your foods once; picking it again returns that copy and never overwrites your edits.
* `npm run dev` runs the same function through a small Vite plugin (`vite.config.ts`) — no Vercel CLI needed.
* `USDA_API_KEY` (server-side env, `.env.local` + Vercel): free at https://api.data.gov/signup/. Without it the shared
  `DEMO_KEY` allows only ~10 USDA requests an hour.

### Indian dishes

`src/data/indian-dishes.json` is a starter list of ~100 everyday dishes (roti, dal, idli, biryani, chai…) with
servings people actually use (`1 roti`, `1 katori`, `1 plate`). It ships with the app, is loaded only when the log
dialog opens, and is searched in the browser: no rows, no API calls. Picking a dish copies it into your foods through
`save_external_food()` (source `ifct`, a name kept from the original plan; the data is not from IFCT).

The numbers are **Trophe's own estimates for a typical home recipe** (per 100 g as eaten), not copied from a licensed
table — the Indian Food Composition Tables (NIN) are copyrighted and not openly licensed. Home cooking varies a lot
(oil, ghee), so treat them as a starting point and edit your copy. A unit test checks every dish fits the foods table
and that its calories agree with its macros.

### Quick add by typing

Type `2 roti dal lunch`, `150g paneer, chai yesterday` or `half katori rice` in the log dialog: a preview lists each
food with its amount and calories, and Enter (or the button) logs them all in one insert. The parser
(`src/lib/quickLog.ts`, unit-tested) runs in the browser against your foods (`quick_log_foods()`) and the Indian
dishes:

* **Foods**: full names, a dish's other names (`chapati` = `roti`), `brand name`, or a serving's own word (`roti`
  finds your food with a `1 roti` serving). Longer names win (`masala dosa` over `dosa`); on an equally good match your
  own food beats a bundled dish. Unknown words come back as "Not in your foods: … search".
* **Amounts**: `150g`, `200 ml`, `2`, `½`, `1 1/2`, `one and a half`, `2x`; household measures (`katori`, `bowl`,
  `plate`, `cup`, `glass`, `tbsp`, `tsp`, `piece`…) use the food's own serving of that name, else a typical size
  (katori 150 g, glass 250 g…). No amount: what you had last time, else one serving. A bare number of 20 or more is grams.
* **When**: `breakfast` / `lunch` / `snacks` / `dinner` (also `morning`, `evening`, `tonight`), `yesterday`,
  `day before yesterday`, `last night`, a weekday (always the most recent past one).

### Barcode scan

The barcode button in the log dialog opens the camera (or takes the number typed in). A valid EAN / UPC code is
looked up in your foods first (any written form: UPC-A, EAN-13, GTIN-14), then on Open Food Facts through
`/api/food-search?barcode=` (copied into your foods when found), else you create the food with the barcode attached
so the next scan finds it. Chrome on Android uses the built-in `BarcodeDetector`; other browsers load a WebAssembly
ZXing reader (`barcode-detector`, pinned) from our own origin, never precached, only when a scan starts.

### Body: weight trend, measurements, water

Daily weight swings by a kilo or more with water and salt, so Progress reads it through a **trend**: an exponentially
weighted moving average (as in *The Hacker's Diet*) where each weigh-in moves the trend 10 % of the way per day since
the previous one. `weight_trend()` works it out in Postgres from the first weigh-in ever, so it is already settled at
the start of any range; `weight_summary()` adds the trend's pace in kg per week (against the weigh-in nearest two
weeks earlier, once there are 7 days to compare). Measurements are one row per day with any of the values filled in.
Water is logged from Today (+250 / +500 ml, take back the last glass) against a goal set in Settings.

**Eating over time** (Progress, same range): calories and macros per day on average, days on target (within 10 % of
that day's goal, as in `range_summary`), weekends against weekdays, and weekly (monthly past ~3 months) columns against
the goal. Averages count only days with something logged — an empty day is a day not tracked, not a fast. Streaks
(days in a row logged / on target, current and best over 400 days) count today once it's logged; until then a
streak runs to yesterday.

The charts are small inline SVG components (`src/components/charts/`), no chart library: hairline grid, 2px trend line,
a crosshair tooltip that snaps to the nearest reading (pointer, touch or arrow keys) and a table view of every value.

### Adaptive calorie target

Formulas (the goal wizard's Mifflin–St Jeor × activity) guess maintenance; your data can measure it.
`maintenance_estimate(today)` takes the 28 days before today: average intake on logged days, minus the energy the
weight trend gained (≈ 7,700 kcal per kg) per day — the trend, not the scale, so water swings don't move it. It needs
14 logged days and 4 weigh-ins spanning two weeks; it reports *low* confidence (and no suggestion) when the result
can't be a real maintenance (outside 1,000–6,000 kcal: usually meals not logged). The goal now remembers its pace
(`goals.pace_kg_week`, set by the wizard), which turns maintenance into a suggested target (never below 1,500 / 1,200
kcal). **Use** on Progress starts a new goal today with protein and fat kept and carbs taking the difference
(`rescaleGoal`); past days keep their goal as always.

### Insights

Plain rules over your own last days, no AI. `insights(today)` decides which apply and returns them as
`{kind, tone, data}` (warnings first); the app words them (`src/lib/insights.ts`, so a newer rule an older app doesn't
know is skipped, not shown broken). Today shows the first two, each dismissible for the day; Progress shows all.

| Rule | When (7 days before today unless noted) |
|---|---|
| protein low | protein under 90 % of the goal on 4+ logged days |
| well under target | 4+ days under and the average below 80 % of the goal |
| losing fast / trend rising / falling | the weight trend's pace against the goal's pace |
| weekends run higher | last 4 weeks: weekend average ≥ 300 kcal above weekdays |
| fibre low, water low | average below 70 % of the goal (4+ logged days; 3+ days of water) |
| nothing logged yesterday | you logged 7+ of the 13 days before |
| on-target streak / steady week | 3+ days on target in a row; or the week's average within 5 % of the goal |

### Recipes

Foods → **New recipe**: add ingredients (your foods or Indian dishes) with amounts, optionally the cooked weight
(everything in the pot after cooking, without the pot — water boils off, so 100 g cooked ≠ 100 g raw) and the number
of portions. `save_recipe()` stores the recipe as a food whose numbers per 100 g are worked out in Postgres
(`recipe_recompute`), with a `1 portion` serving, so it's logged, searched and quick-added like any food (`1 portion
khichdi`). Editing an ingredient's nutrients updates its recipes (a trigger); entries already logged keep their numbers
as always. Recipes can't be ingredients of other recipes. Deleting an ingredient food drops it from the recipe, which
keeps its numbers until it's saved again.

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
20261022130000_trophe_08_external_foods.sql  save_external_food(): keep an online food when you pick it
20261022140000_trophe_09_quick_log.sql       quick_log_foods(): your foods, servings and last amounts for quick add
20261022150000_trophe_10_recipes.sql         recipes: recipe_items, save_recipe(), numbers kept in step with ingredients
20261022160000_trophe_11_body.sql            measurements, water, water goal; weight_trend() / weight_summary()
20261022170000_trophe_12_eating_trends.sql   nutrition_periods(), nutrition_stats(), streaks()
20261022180000_trophe_13_adaptive_target.sql goals.pace_kg_week; maintenance_estimate()
20261022190000_trophe_14_insights.sql        insights(): the rules behind Today's insight cards
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
   Phase 2 allows the camera for Trophe only (`camera=(self)`) and `'wasm-unsafe-eval'` for the barcode fallback;
   Open Food Facts is reached through our function, so `connect-src` is unchanged.
4. Add the deployed URL to Supabase **Redirect URLs** (5.3).

---

## 7. Testing

```bash
npm test          # unit tests (vitest): env checks, dates/timezones, themes, meals, nutrition maths, amounts,
                  #   online-food normalising, barcodes, the Indian dishes list, the quick-add parser, recipe maths,
                  #   chart ticks
npm run test:sql  # SQL suite in a throwaway local Postgres (needs initdb/pg_ctl/psql)
npm run test:int  # integration: real API code + real migrations through PostgREST (needs podman or docker)
npm run lint && npm run build
```

* **SQL suite** (`supabase/tests/trophe_tests.sql`, rolled back at the end): settings defaults and checks, upsert
  behaviour, food checks, nutrient copying and history staying fixed, goals by date, range verdicts, recent/frequent,
  search, copying and saved meals, online foods, quick-add foods, recipes (maths, portions, ingredient edits, no nesting), weight trend and pace, measurements, water, eating averages and streaks, the maintenance estimate, insight rules, a **tenant-isolation matrix** (user B cannot read, update, delete, create or take over user A's rows),
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
