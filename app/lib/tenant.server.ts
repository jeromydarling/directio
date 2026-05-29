import { redirect } from "react-router";
import { getAuth } from "./auth.server";

export type ActiveTenant = {
  user: { id: string; email: string; name: string | null; image: string | null };
  organization: {
    id: string;
    slug: string;
    name: string;
    logo: string | null;
    brandColor: string | null;
    isDemo: boolean;
    demoExpiresAt: number | null;
    subscriptionTier: "free" | "studio" | "pro";
    stripePlatformSubscriptionStatus: string | null;
  };
  role: string;
};

/**
 * Require a signed-in user with an active organization membership.
 * Returns the user, the organization they're scoped to, and their role.
 *
 * If the user is signed in but has no organization, redirect them to the
 * onboarding flow (to be built; for now we send them to /onboarding).
 */
export async function requireTenant(request: Request, env: Env): Promise<ActiveTenant> {
  const auth = getAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }

  // Resolve the active organization. Better Auth's session may carry an
  // activeOrganizationId; otherwise fall back to the user's first membership.
  const activeOrgId = session.session?.activeOrganizationId ?? null;

  type OrgRow = {
    id: string;
    slug: string;
    name: string;
    logo: string | null;
    brandColor: string | null;
    isDemo: number;
    demoExpiresAt: number | null;
    subscriptionTier: string | null;
    stripePlatformSubscriptionStatus: string | null;
    role: string;
  };

  const orgCols =
    "o.id, o.slug, o.name, o.logo, o.brandColor, o.isDemo, o.demoExpiresAt, o.subscriptionTier, o.stripePlatformSubscriptionStatus, m.role";

  let org: OrgRow | null = null;
  if (activeOrgId) {
    const r = await env.DB.prepare(
      `SELECT ${orgCols}
       FROM organization o
       JOIN member m ON m.organizationId = o.id
       WHERE m.userId = ? AND o.id = ?
       LIMIT 1`,
    )
      .bind(session.user.id, activeOrgId)
      .first<OrgRow>();
    org = r ?? null;
  }
  if (!org) {
    const r = await env.DB.prepare(
      `SELECT ${orgCols}
       FROM organization o
       JOIN member m ON m.organizationId = o.id
       WHERE m.userId = ?
       ORDER BY m.createdAt ASC
       LIMIT 1`,
    )
      .bind(session.user.id)
      .first<OrgRow>();
    org = r ?? null;
  }

  if (!org) {
    throw redirect("/onboarding");
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
    organization: {
      id: org.id,
      slug: org.slug,
      name: org.name,
      logo: org.logo,
      brandColor: org.brandColor,
      isDemo: org.isDemo === 1,
      demoExpiresAt: org.demoExpiresAt,
      subscriptionTier: normalizeTier(org.subscriptionTier),
      stripePlatformSubscriptionStatus: org.stripePlatformSubscriptionStatus,
    },
    role: org.role,
  };
}

function normalizeTier(raw: string | null): "free" | "studio" | "pro" {
  if (raw === "studio") return "studio";
  if (raw === "pro") return "pro";
  return "free";
}

/**
 * Find the student row for the current user inside the current org.
 *
 * Tries userId first. If nothing matches but a student exists with the
 * user's email and no userId yet, claim it by setting student.userId.
 * This makes the "admin adds student, student signs up later" flow
 * self-healing without an extra invite step.
 */
export async function findStudentForUser(
  env: Env,
  user: { id: string; email: string },
  organizationId: string,
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const direct = await env.DB.prepare(
    "SELECT id, firstName, lastName FROM student WHERE userId = ? AND organizationId = ? LIMIT 1",
  )
    .bind(user.id, organizationId)
    .first<{ id: string; firstName: string; lastName: string }>();
  if (direct) return direct;

  const byEmail = await env.DB.prepare(
    "SELECT id, firstName, lastName FROM student WHERE email = ? AND organizationId = ? AND userId IS NULL LIMIT 1",
  )
    .bind(user.email, organizationId)
    .first<{ id: string; firstName: string; lastName: string }>();
  if (!byEmail) return null;

  await env.DB.prepare("UPDATE student SET userId = ?, updatedAt = ? WHERE id = ?")
    .bind(user.id, Date.now(), byEmail.id)
    .run();
  return byEmail;
}
