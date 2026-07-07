/**
 * Super-admin (platform-side CRM) helpers.
 *
 * Gate: `requirePlatformAdmin` throws a 404 for anyone not listed in
 * the `platform_admin` table. Deliberately not "403 Forbidden" — we
 * don't want to reveal that /super exists.
 *
 * Health score: 0..100. Computed from a handful of signals that
 * correlate with churn (last owner login, revenue in last 30d, Stripe
 * connected, website published, unpaid A/R, license expirations).
 * Cached in `organization.crmHealthScore` so the list page can sort
 * without recomputing per row.
 */

import { redirect } from "react-router";
import { getSession } from "./session.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PlatformAdmin = {
  userId: string;
  role: "admin" | "read_only";
  addedAt: number;
};

export async function isPlatformAdmin(
  env: Env,
  userId: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT userId FROM platform_admin WHERE userId = ?",
  )
    .bind(userId)
    .first<{ userId: string }>();
  return Boolean(row);
}

// Route helper — mirrors `requireTenant`. Throws a 404 Response for
// non-admins, so the surface is invisible to signed-in customers.
export async function requirePlatformAdmin(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session?.user) {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  const admin = await isPlatformAdmin(env, session.user.id);
  if (!admin) {
    throw new Response("Not found", { status: 404 });
  }
  return { user: session.user };
}

export type OrgHealthInput = {
  organizationId: string;
  createdAt: number;
  lastOwnerLoginAt: number | null;
  revenueLast30Cents: number;
  enrollmentsLast30: number;
  stripeConnected: boolean;
  websitePublished: boolean;
  unpaidArCents: number;
  expiredLicenses: number;
};

// Additive score. Anchored at 100 for a healthy org; each risk signal
// docks points. Bounded to [0, 100]. The list page uses this as the
// primary sort key when the operator picks "at-risk first".
export function computeHealthScore(input: OrgHealthInput, now: number): number {
  const ageMs = now - input.createdAt;
  const isNew = ageMs < 14 * DAY_MS;

  let score = 100;

  // Signals of a working relationship
  if (!input.stripeConnected) score -= 25;
  if (!input.websitePublished && !isNew) score -= 10;
  if (input.revenueLast30Cents === 0 && !isNew) score -= 25;
  if (input.enrollmentsLast30 === 0 && !isNew) score -= 15;

  // Owner engagement
  if (input.lastOwnerLoginAt == null) {
    if (!isNew) score -= 15;
  } else {
    const daysSinceLogin = (now - input.lastOwnerLoginAt) / DAY_MS;
    if (daysSinceLogin > 30) score -= 25;
    else if (daysSinceLogin > 14) score -= 15;
    else if (daysSinceLogin > 7) score -= 5;
  }

  // Reactive signals — active problems in the account
  if (input.unpaidArCents > 100_000) score -= 10;
  if (input.expiredLicenses > 0) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function healthBand(score: number): "healthy" | "watch" | "at-risk" {
  if (score >= 75) return "healthy";
  if (score >= 45) return "watch";
  return "at-risk";
}

export async function recomputeAndPersistHealth(
  env: Env,
  organizationId: string,
  createdAt: number,
  now: number,
): Promise<number> {
  const since30 = now - 30 * DAY_MS;

  const [rev, enroll, stripe, website, ar, expired, owner] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(SUM(schoolNetCents), 0) AS cents
         FROM payment WHERE organizationId = ?
          AND status = 'succeeded' AND createdAt >= ?`,
    )
      .bind(organizationId, since30)
      .first<{ cents: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM enrollment
        WHERE organizationId = ? AND createdAt >= ?`,
    )
      .bind(organizationId, since30)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT stripeChargesEnabled AS enabled FROM organization WHERE id = ?`,
    )
      .bind(organizationId)
      .first<{ enabled: number }>(),
    env.DB.prepare(
      `SELECT publicPublishedAt AS at FROM organization WHERE id = ?`,
    )
      .bind(organizationId)
      .first<{ at: number | null }>(),
    env.DB.prepare(
      `SELECT COALESCE(SUM(amountCents), 0) AS cents FROM payment
        WHERE organizationId = ?
          AND status IN ('pending','requires_action','failed')`,
    )
      .bind(organizationId)
      .first<{ cents: number }>(),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM instructor
        WHERE organizationId = ? AND active = 1
          AND stateLicenseExpiresAt IS NOT NULL AND stateLicenseExpiresAt < ?`,
    )
      .bind(organizationId, now)
      .first<{ n: number }>(),
    env.DB.prepare(
      `SELECT MAX(u.updatedAt) AS at
         FROM member m JOIN user u ON u.id = m.userId
        WHERE m.organizationId = ? AND m.role IN ('owner','admin')`,
    )
      .bind(organizationId)
      .first<{ at: number | null }>(),
  ]);

  const score = computeHealthScore(
    {
      organizationId,
      createdAt,
      lastOwnerLoginAt: owner?.at ?? null,
      revenueLast30Cents: rev?.cents ?? 0,
      enrollmentsLast30: enroll?.n ?? 0,
      stripeConnected: Boolean(stripe?.enabled),
      websitePublished: Boolean(website?.at),
      unpaidArCents: ar?.cents ?? 0,
      expiredLicenses: expired?.n ?? 0,
    },
    now,
  );

  await env.DB.prepare(
    "UPDATE organization SET crmHealthScore = ?, crmHealthComputedAt = ? WHERE id = ?",
  )
    .bind(score, now, organizationId)
    .run();

  return score;
}
