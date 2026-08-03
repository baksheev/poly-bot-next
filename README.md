# Poly Bot P&L Dashboard

Read-only Next.js dashboard for `poly_bot` arbitrage accounting and operational
diagnostics. The visual implementation follows the supplied P&L mockup, while
the code organization follows `content-factory-next` without Clerk.

## What is included

- Overview with pair and date filters, KPI cards, daily P&L chart, and an
  expandable accounting statement.
- Diagnostics with recent terminal arbitrage results and the latest unresolved
  `BlockedUnknown` inventory states.
- A server-only ClickHouse repository for `arb_bot_prod.runtime_telemetry`.
- Deterministic demo data when ClickHouse is not configured or temporarily
  unavailable.
- Feature-Sliced boundaries: `app -> widgets -> features -> entities -> shared`.

## Local development

Use Node 24 and pnpm 10.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

The demo works without environment variables. To use live data, set these
server-only values in `.env.local`:

```dotenv
CLICKHOUSE_URL=https://your-clickhouse-http-endpoint
CLICKHOUSE_DATABASE=arb_bot_prod
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=...
```

Set `CLICKHOUSE_REQUIRED=1` only when a ClickHouse outage should fail the page
instead of falling back to demo data.

## Data contract

The repository reads the two production pair IDs already emitted by `poly_bot`:

- `world-chain-usdc-wld`
- `arbitrum-usdc-esp`

Daily P&L comes from terminal `dex_first` events with
`kind = 'arbitrage_result'` in `runtime_telemetry`.
Comparable P&L uses `comparable_profit_token_a_base_units`, which includes the
conservative residual inventory mark. Daily turnover uses the realized primary
USDC cost from completed trades. Open exposure is derived from the latest
`arbitrage_inventory_state` per plan and excludes plans with a newer terminal
result.

All queries are server-side, read-only, bounded, and use validated database
identifiers. ClickHouse credentials must never use a `NEXT_PUBLIC_` prefix.

## Authentication and deployment

The entire dashboard is protected by a single server-side password. A valid
login creates an HMAC-signed, `HttpOnly`, `Secure`, `SameSite=Lax` session cookie
that expires after 30 days. Middleware rejects unauthenticated requests, and the
page repeats the session check before querying ClickHouse.

Generate separate high-entropy values and add them to `.env.local` and to the
Production environment in Vercel:

```bash
openssl rand -base64 24
openssl rand -base64 32
```

```dotenv
DASHBOARD_PASSWORD=<first value; at least 16 characters>
AUTH_SECRET=<second value; at least 32 characters>
```

Changing `AUTH_SECRET` immediately invalidates every existing session. Neither
authentication value may use a `NEXT_PUBLIC_` prefix.

The project retains the same Vercel-friendly standalone Next.js shape as
`content-factory-next`.

## Verification

```bash
pnpm build
pnpm typecheck
pnpm lint
```
