# Poly Bot dashboard engineering guide

This project is a Next.js 15 / React 19 read-only operations dashboard deployed
to Vercel. Use Node 24 and pnpm 10.

## Architecture

Follow one-way Feature-Sliced Design boundaries:

```text
app -> widgets -> features -> entities -> shared
```

- Keep `app/` route files thin. They load data and compose widgets.
- Put assembled page shells in `widgets/`.
- Put product behavior and domain UI in `features/<domain>/`.
- Put reusable domain objects and repositories in `entities/`.
- Put framework-agnostic utilities and infrastructure clients in `shared/`.
- Import through a layer's public `index.ts` instead of deep-importing internals.
- Lower layers must never import higher layers.

## Security

- ClickHouse credentials are server-only and must never use a `NEXT_PUBLIC_`
  prefix.
- Every query is read-only and identifiers must be validated before use.
- Authentication is intentionally not implemented yet. Do not expose a
  deployment publicly until an access-control layer is selected.

## Verification

Run in this order:

```bash
pnpm build
pnpm typecheck
pnpm lint
```
