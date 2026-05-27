# directio

The multi-tenant operating system for driver education.

Read [`docs/product-spec.md`](docs/product-spec.md) for the product brief and
[`CLAUDE.md`](CLAUDE.md) for the active stack decisions.

## Stack

- **Cloudflare Workers** runtime
- **React Router v7** (full-stack, SSR) — Vite + the Cloudflare plugin
- **Tailwind CSS v4** (CSS-first, `@theme` tokens)
- **D1** for relational data, **R2** for blob storage, **KV** for cache
- **Better Auth** on Workers (D1-backed sessions) — _to be wired in_

## Quickstart

```bash
npm install
npm run db:migrate:local        # apply migrations to the local D1
npm run dev                     # http://localhost:5173
```

Wrangler types are generated automatically by `postinstall`. Run
`npm run typecheck` to typecheck the project against the current bindings.

## Cloudflare resources (dev)

Provisioned via the Cloudflare MCP — do not recreate by hand.

| Resource | Binding | Name | ID |
|---|---|---|---|
| D1 database | `DB` | `directio-dev` | `c0cf0619-a5f5-4ed4-ad7e-e1bfe7cb73db` |
| R2 bucket | `ASSETS` | `directio-dev-assets` | — |
| KV namespace | `CACHE` | `directio-dev-cache` | `032cdcf60cfa4dce999cdc372b5e2765` |

## Migrations

D1 migrations live in [`migrations/`](migrations/) and are applied with
`wrangler d1 migrations apply directio-dev`. Migration `0001_init.sql` sets up
Better-Auth-compatible identity tables plus the multi-tenant core
(`organizations`, `members`, `invitations`, `audit_logs`).

## Deploy

```bash
npm run db:migrate:remote
npm run deploy
```
