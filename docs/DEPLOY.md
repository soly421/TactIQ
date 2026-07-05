# TactIQ — deploy & infrastructure runbook

TactIQ is a single Node process that serves both the API and the built React
client, backed by a single SQLite file (better-sqlite3, WAL mode) on a
persistent disk. It scales **up** (a bigger instance), not out — SQLite is a
local file, so you don't run multiple app instances against one database. For
POCs and well into real traffic (the first several thousand paying / tens of
thousands of registered users) this is the right, low-ops architecture. The
migration path when you outgrow it is SQLite → managed Postgres; that's a
$300–500k-ARR problem, not a launch problem.

Everything below is already wired in `render.yaml`, `Dockerfile`,
`litestream.yml`, and `docker-entrypoint.sh`. This doc is the operator's guide.

---

## 1. First deploy (Render)

1. **Point Render at the deploy branch** (or merge your work into it).
2. **New → Blueprint → this repo.** Render reads `render.yaml`: a Docker web
   service, a 1 GB persistent disk at `/data`, and the `/api/health` check.
   Use the **`starter` plan or higher** — `free` has no disk (data resets) and
   cold-starts.
3. **Set the secrets** (dashboard → service → Environment). `JWT_SECRET` is
   generated for you and kept stable. Fill in:
   - `ANTHROPIC_API_KEY` **and** `OPENAI_API_KEY` — set **both** for real
     failover (see §4). Until at least one is set, the app runs in honest demo
     mode.
   - `PUBLIC_URL` — your live https URL (e.g. `https://tactiq.onrender.com`).
   - `ADMIN_EMAILS` — `sam.olyaei@gmail.com` (unlocks the founder dashboard).
   - Backups (§3) and billing (§5) when ready.
4. **Deploy, then smoke-test:** `GET <url>/api/health` → `{"ok":true,...}`; load
   the app, register, paint a scenario on the Tactics board.
5. **Custom domain (optional):** Settings → Custom Domains → add + set the
   CNAME; Render provisions TLS. Update `PUBLIC_URL` to match.

For a demo-mode POC you can stop after step 4.

---

## 2. How the container boots

`docker-entrypoint.sh` decides at runtime:

- **Backups configured** (`LITESTREAM_BUCKET` + credentials present):
  Litestream restores the DB if the disk is empty (disaster / new instance),
  then runs the server as its child while streaming every change off-site.
  Signals are forwarded, so a deploy/restart does a clean final sync.
- **Not configured:** the server runs directly, on the disk alone.

So a deploy without backup env vars still works — backups are additive.

---

## 3. Off-site backups (Litestream → Cloudflare R2) — do this before real users

Render's disk survives redeploys but is a single disk with no point-in-time
backup. Litestream closes that: continuous replication + restore.

1. **Create an R2 bucket** (Cloudflare dashboard → R2 → Create bucket, e.g.
   `tactiq-db`). R2 is cheap and has zero egress fees.
2. **Create an R2 API token** (R2 → Manage API Tokens → Create, Object
   Read & Write). Note the Access Key ID, Secret Access Key, and your account
   ID (the endpoint is `https://<account-id>.r2.cloudflarestorage.com`).
3. **Set on Render:**
   - `LITESTREAM_BUCKET` = `tactiq-db`
   - `LITESTREAM_ENDPOINT` = `https://<account-id>.r2.cloudflarestorage.com`
   - `LITESTREAM_ACCESS_KEY_ID` = the token's access key id
   - `LITESTREAM_SECRET_ACCESS_KEY` = the token's secret
   - `LITESTREAM_REGION` is preset to `auto`.
4. **Redeploy.** Logs should show `Litestream backup ENABLED`. Within a minute
   the bucket gets a `tactiq/` prefix with `generations/…` — that's the live
   replica.

**Verify restore (recommended once):** in the Render shell,
`litestream restore -o /tmp/check.db /data/tactiq.db` should pull a byte-for-
byte copy from R2. Point-in-time restore is retained ~72h (see
`litestream.yml`).

**Disaster recovery:** on a fresh/empty disk the entrypoint auto-restores from
R2 on boot — nothing manual required.

---

## 4. AI engines & failover

Two providers, cost-named tiers (`server/src/providers.ts`): light = Haiku /
gpt-5-mini, standard = Sonnet / gpt-5.1, deep = Fable / gpt-5.1. Calls try
`PREFERRED_PROVIDER` (default Anthropic) and **transparently retry on the
other** on error/rate-limit — but only if **both** `ANTHROPIC_API_KEY` and
`OPENAI_API_KEY` are set. With one key, that provider's outage is downtime.
Verify your OpenAI account has access to the `gpt-5.1` / `gpt-5-mini` model IDs
(or override via `OPENAI_MODEL_*`). Spend is guarded by per-day request caps,
a per-user dollar ceiling (`COST_CEILING_FREE`/`_PRO`), and atomic
reserve-before-call accounting — watch it on the founder dashboard.

---

## 5. Billing (Stripe) — only when charging

Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`,
`STRIPE_PRICE_ID_PRO_ANNUAL`, `STRIPE_PRICE_ID_CLUB_SEAT`. Add a Stripe webhook
at `<PUBLIC_URL>/api/billing/webhook` for `checkout.session.completed`,
`customer.subscription.updated`, `customer.subscription.deleted`. Create the
promo coupons `FOUNDING100` (founding coaches: $14.99/mo for life, max 100) and
`FOUNDING50` (founding clubs: 50% off year one, max 10) — the pricing page
promises these, so they must exist with those terms. POCs run fine without
Stripe (no payments taken).

---

## 6. Scaling signals

| Signal | Meaning | Move |
|---|---|---|
| Sustained high CPU/RAM | Vertical headroom shrinking | Bump the Render plan |
| Need zero-downtime deploys / HA | One node is a single point of failure | Migrate SQLite → managed Postgres, then run multiple instances |
| AI spend outpacing revenue | Provider cost | Tune `COST_CEILING_*`; watch the founder dashboard |
| `database is locked` errors | SQLite write saturation (unlikely for a long time) | The Postgres signal |

Don't pre-build Postgres/Kubernetes/multi-region — premature at POC scale.
