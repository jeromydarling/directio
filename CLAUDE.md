# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

`directio` is a driving school app. The repository is in greenfield state — only a README placeholder exists. No source code, build system, tests, or dependencies are committed yet. Do not invent commands or architecture; update this file as real structure lands.

## Intended stack

The user has chosen Cloudflare as the deployment target. When scaffolding, default to:

- **Cloudflare Workers** for the app server / API.
- **D1** (SQLite) for relational data — students, instructors, lessons, bookings, vehicles.
- **R2** for blob storage — license scans, vehicle documents, signed student paperwork.
- **KV** only if a clearly cache-shaped need appears; otherwise prefer D1.

The Cloudflare MCP (`mcp__5c1cfad4-...`) is connected and can create/manage D1 databases, R2 buckets, KV namespaces, and inspect deployed Workers. Use it for provisioning rather than asking the user to run `wrangler` by hand.

## Domain notes

Core entities to expect: **students**, **instructors**, **vehicles**, **lessons/bookings**, **packages/payments**. Scheduling (instructor availability ↔ student bookings) is the central workflow and should drive the data model. Stripe and Google Calendar MCPs are available if/when payments and calendar sync are added.
