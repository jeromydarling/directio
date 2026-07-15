import { redirect } from "react-router";
import { getAuth } from "./auth.server";
import { newId } from "./ids";

export type ActiveTenant = {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    emailVerified: boolean;
    /**
     * Use THIS (not .email) in ownership fallbacks like
     * `... OR s.email = ?`. For unverified users it's a sentinel that
     * can never equal a real email address, so signing up with
     * someone else's address (email verification defaults off) can't
     * claim their student records. Verified via magic-link click.
     */
    ownershipEmail: string;
  };
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

// Contains a space, which no real email address can.
const UNVERIFIED_SENTINEL = "unverified email sentinel";

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

  const emailVerified = Boolean(session.user.emailVerified);

  // No membership yet — before bouncing to onboarding, try claiming
  // any student/instructor records a school pre-created with this
  // email. Only for VERIFIED emails (magic-link click proves
  // ownership); an unverified signup with someone else's address
  // must never inherit their school records.
  if (!org && emailVerified) {
    const claimed = await claimPendingMemberships(env, {
      id: session.user.id,
      email: session.user.email,
    });
    if (claimed) {
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
      emailVerified,
      ownershipEmail: emailVerified ? session.user.email : UNVERIFIED_SENTINEL,
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
 * Claim school-created student/instructor records matching a VERIFIED
 * email. Links the rows to the user and creates the corresponding
 * member rows. Returns true if anything was claimed.
 *
 * Callers are responsible for the verification check — this function
 * trusts that `user.email` is proven to belong to `user.id` (magic-
 * link click). Claiming on an unverified email is an account-takeover
 * vector: sign up as victim@x.com before the victim does, wait for a
 * school to add that student, inherit their record.
 */
export async function claimPendingMemberships(
  env: Env,
  user: { id: string; email: string },
): Promise<boolean> {
  const now = Date.now();
  const stmts: D1PreparedStatement[] = [];

  const studentMatches = await env.DB.prepare(
    "SELECT id, organizationId FROM student WHERE email = ? AND userId IS NULL",
  )
    .bind(user.email)
    .all<{ id: string; organizationId: string }>();
  for (const m of studentMatches.results) {
    stmts.push(
      env.DB.prepare("UPDATE student SET userId = ?, updatedAt = ? WHERE id = ?").bind(
        user.id,
        now,
        m.id,
      ),
      env.DB.prepare(
        "INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'student', ?)",
      ).bind(newId(), m.organizationId, user.id, now),
    );
  }

  const instructorMatches = await env.DB.prepare(
    "SELECT id, organizationId FROM instructor WHERE email = ? AND userId IS NULL",
  )
    .bind(user.email)
    .all<{ id: string; organizationId: string }>();
  for (const m of instructorMatches.results) {
    stmts.push(
      env.DB.prepare("UPDATE instructor SET userId = ? WHERE id = ?").bind(user.id, m.id),
      env.DB.prepare(
        "INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'instructor', ?)",
      ).bind(newId(), m.organizationId, user.id, now),
    );
  }

  if (stmts.length === 0) return false;
  await env.DB.batch(stmts);
  return true;
}

/**
 * Find the student row for the current user inside the current org.
 *
 * Tries userId first. If nothing matches but a student exists with the
 * user's VERIFIED email and no userId yet, claim it by setting
 * student.userId. This keeps the "admin adds student, student signs up
 * later" flow self-healing — but only once the user has proven the
 * email is theirs via magic-link.
 */
export async function findStudentForUser(
  env: Env,
  user: { id: string; email: string; emailVerified?: boolean },
  organizationId: string,
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  const direct = await env.DB.prepare(
    "SELECT id, firstName, lastName FROM student WHERE userId = ? AND organizationId = ? LIMIT 1",
  )
    .bind(user.id, organizationId)
    .first<{ id: string; firstName: string; lastName: string }>();
  if (direct) return direct;

  if (!user.emailVerified) return null;

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
