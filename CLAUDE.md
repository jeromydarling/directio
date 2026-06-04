# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`directio` is a **multi-tenant driver education operating system** — not just a driving school app. It bundles a lightweight LMS inside a workflow engine that handles enrollment, state-specific compliance milestones, scheduling, and permit-eligibility credentialing. The full product brief lives at `docs/product-spec.md`; read it before making non-trivial architectural decisions. This file captures only the durable stack/architecture decisions that future sessions need at a glance.

## Project status

Greenfield. Only `README.md`, `CLAUDE.md`, and `docs/product-spec.md` exist. No build system, schema, or code committed yet. Do not invent commands — update this file as real structure lands.

## Stack decision (Cloudflare, not Supabase)

The product spec was originally written assuming Supabase + Postgres. **This project has explicitly chosen Cloudflare.** Targets:

- **Cloudflare Workers** — runtime.
- **React Router v7** (formerly Remix) on Workers — full-stack framework for all user-facing surfaces. Chosen over Hono+HTMX because design polish (scheduling board interactions, lesson player, motion) is a product priority.
- **Better Auth** on Workers, D1-backed sessions — email/password + magic link, multi-org/tenant support.
- **D1** (SQLite) — relational store for tenants, students, instructors, enrollments, lessons, rule packs, content packs, audit logs.
- **R2** — blob storage for lesson assets (video/PDF/images), credential PDFs, signed waivers.
- **KV** — only for cache-shaped needs (e.g. rendered rule-pack snapshots); prefer D1 as source of truth.
- **Tailwind CSS** + CSS custom properties for per-tenant theming (logo/colors/fonts).
- **Stripe** — payments / payment plans (MCP connected).
- Email/SMS providers (Resend/Postmark + Twilio or similar) — TBD when commerce lands.

The Cloudflare MCP is connected and should be used to provision D1 databases, R2 buckets, KV namespaces — not `wrangler` invoked by the user.

### Stack consequences that matter

- **No row-level security.** D1 is SQLite; tenant isolation must be enforced in application code on every query (always scope by `organization_id`). Build a query helper that refuses unscoped reads.
- **Auth is Better Auth on Workers.** Sessions stored in D1. Roles to support (per `docs/product-spec.md`): super admin, school owner/admin, instructor, parent, student.
- **Background jobs.** No Supabase cron — use Cloudflare Cron Triggers / Queues for reminders, no-show follow-ups, scheduled communications.

## Core architectural pillars

These shape the data model and must not be flattened during MVP:

1. **Multi-tenancy from day one** — every row that isn't platform-global belongs to an `organization`. Locations are sub-tenants.
2. **Declarative, versioned rules engine** — state requirements live in `rule_packs` + `rule_pack_versions` with `organization_rule_overrides`. Never put state logic in UI code.
3. **State adapter model with maturity levels** — Level 1 (manual checklist), Level 2 (export/PDF), Level 3 (API). Honest national coverage; deep MN implementation first.
4. **Generic permit-eligibility credential** — model as `credentials` + `credential_submissions`; jurisdiction adapter supplies the display label ("Blue Card" in MN, other terms elsewhere).
5. **Install-copy-edit curriculum packs** — schools install a copy of a platform-owned `content_pack_version`; edits go to `school_courses`, never to the master. Versioning + update notices required.
6. **Student journey timeline as a first-class object** — not a derived view. Enrollment → classroom → permit credential → BTW → road test → complete. Visible per-role.
7. **Audit logs on every compliance action** — credential issuance/submission, rule overrides, fee changes, manual milestone events.

See `docs/product-spec.md` for the full entity list (~30 tables) and the rule example.

## MVP surfaces (Phase 1)

Five primary surfaces, each with its own role-scoped UX: public registration/checkout, school admin console, instructor scheduling, parent portal, student LMS+timeline. Phase 2 adds the curriculum marketplace; Phase 3 adds AI assistants and deeper state integrations. Don't pull Phase 2/3 work into MVP scaffolding without explicit approval.

## UX non-negotiables

- One login, one timeline, one payment history per family.
- Transparent fees before enrollment (tuition, admin/compliance, credential, reschedule). No mystery fees.
- A persistent "what happens next?" block for parents and students.
- Mobile-friendly from day one.
