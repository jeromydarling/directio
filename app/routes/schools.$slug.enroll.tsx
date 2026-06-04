import { Form, Link, data, redirect, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/schools.$slug.enroll";
import { generateClaimPendingPassword, getAuth } from "~/lib/auth.server";
import { getSession } from "~/lib/session.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextInput } from "~/components/form";

type OrgRow = {
  id: string;
  name: string;
  publicSlug: string;
  publicPublishedAt: number | null;
  stripeChargesEnabled: number;
};

type PackageRow = {
  packageId: string;
  packageName: string;
  priceCents: number;
  btwLessons: number;
  programId: string;
  programName: string;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const db = env.DB;

  const org = await db
    .prepare(
      `SELECT id, name, publicSlug, publicPublishedAt, stripeChargesEnabled
         FROM organization WHERE publicSlug = ? AND publicPublishedAt IS NOT NULL`,
    )
    .bind(params.slug)
    .first<OrgRow>();
  if (!org) throw new Response("Not found", { status: 404 });

  const packages = await db
    .prepare(
      `SELECT pp.id AS packageId, pp.name AS packageName, pp.priceCents,
              pp.btwLessonCount AS btwLessons, p.id AS programId, p.name AS programName
         FROM programPackage pp
         JOIN program p ON p.id = pp.programId
         WHERE pp.organizationId = ? AND pp.active = 1 AND p.active = 1
         ORDER BY p.name, pp.priceCents`,
    )
    .bind(org.id)
    .all<PackageRow>();

  const session = await getSession(request, env);
  return {
    org,
    packages: packages.results,
    signedInEmail: session?.user?.email ?? null,
    signedInUserId: session?.user?.id ?? null,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const db = env.DB;
  const formData = await request.formData();
  const now = Date.now();

  const org = await db
    .prepare("SELECT id, name, publicSlug FROM organization WHERE publicSlug = ? AND publicPublishedAt IS NOT NULL")
    .bind(params.slug)
    .first<{ id: string; name: string; publicSlug: string }>();
  if (!org) throw new Response("Not found", { status: 404 });

  const packageId = String(formData.get("packageId") ?? "");
  const studentFirst = String(formData.get("studentFirst") ?? "").trim();
  const studentLast = String(formData.get("studentLast") ?? "").trim();
  const studentEmail = String(formData.get("studentEmail") ?? "").trim() || null;
  const parentName = String(formData.get("parentName") ?? "").trim();
  const parentEmail = String(formData.get("parentEmail") ?? "").trim();
  const parentPhone = String(formData.get("parentPhone") ?? "").trim() || null;

  if (!packageId || !studentFirst || !studentLast || !parentName || !parentEmail) {
    return data(
      { error: "Please fill in the student name, your name, and your email." },
      { status: 400 },
    );
  }

  const pkg = await db
    .prepare(
      `SELECT pp.id AS packageId, pp.programId, pp.priceCents, pp.name AS packageName,
              p.name AS programName
         FROM programPackage pp
         JOIN program p ON p.id = pp.programId
         WHERE pp.id = ? AND pp.organizationId = ? AND pp.active = 1 AND p.active = 1`,
    )
    .bind(packageId, org.id)
    .first<{
      packageId: string;
      programId: string;
      priceCents: number;
      packageName: string;
      programName: string;
    }>();
  if (!pkg) return data({ error: "That package is no longer available." }, { status: 400 });

  // Guest checkout per spec #6: parents never see a password field.
  // Three paths:
  //   1. Signed in already → use that session.
  //   2. Email already has an account → don't sign them in (no password),
  //      but proceed with enrollment under that account; send a magic-link
  //      email so they can open the portal after paying.
  //   3. Fresh email → create the account behind the scenes with a
  //      server-generated throwaway password, mint a session cookie so
  //      they land in the portal immediately, AND send a magic link as
  //      a permanent backup login.
  const session = await getSession(request, env);
  const auth = getAuth(env);
  let parentUserId: string | null = session?.user?.id ?? null;
  let cookieHeaders: Headers | null = null;
  let accountFlow: "signed_in" | "merged_existing" | "fresh_account" = "signed_in";

  if (!parentUserId) {
    const existing = await db
      .prepare("SELECT id FROM user WHERE email = ?")
      .bind(parentEmail)
      .first<{ id: string }>();
    if (existing) {
      parentUserId = existing.id;
      accountFlow = "merged_existing";
    } else {
      try {
        const response = await auth.api.signUpEmail({
          body: {
            email: parentEmail,
            password: generateClaimPendingPassword(),
            name: parentName,
          },
          headers: request.headers,
          asResponse: true,
        });
        if (!response.ok) {
          const body = await response.text();
          let msg = "Could not create your account. Try the magic-link sign-in option.";
          try {
            const parsed = JSON.parse(body) as { message?: string };
            if (parsed.message) msg = parsed.message;
          } catch {
            /* ignore */
          }
          return data({ error: msg }, { status: response.status });
        }
        cookieHeaders = new Headers();
        response.headers.forEach((value, key) => {
          if (key.toLowerCase() === "set-cookie")
            cookieHeaders!.append("Set-Cookie", value);
        });
        const newUser = await db
          .prepare("SELECT id FROM user WHERE email = ?")
          .bind(parentEmail)
          .first<{ id: string }>();
        parentUserId = newUser?.id ?? null;
        accountFlow = "fresh_account";
      } catch (err) {
        return data(
          { error: err instanceof Error ? err.message : "Sign-up failed." },
          { status: 400 },
        );
      }
    }
  }
  if (!parentUserId) return data({ error: "Could not resolve account." }, { status: 500 });

  // Make sure the parent has a member row as 'parent' for this org.
  await db
    .prepare(
      `INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt)
       VALUES (?, ?, ?, 'parent', ?)`,
    )
    .bind(newId(), org.id, parentUserId, now)
    .run();

  // Create the student. If studentEmail is set and matches an existing
  // user, link to them; otherwise just store the email.
  let studentUserId: string | null = null;
  if (studentEmail) {
    const u = await db.prepare("SELECT id FROM user WHERE email = ?").bind(studentEmail).first<{
      id: string;
    }>();
    if (u) studentUserId = u.id;
  }
  const studentId = newId();
  await db
    .prepare(
      `INSERT INTO student (id, organizationId, userId, firstName, lastName, email, phone, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      studentId,
      org.id,
      studentUserId,
      studentFirst,
      studentLast,
      studentEmail,
      parentPhone,
      now,
      now,
    )
    .run();

  // Create the guardian + guardianStudent link.
  const guardianId = newId();
  await db
    .prepare(
      `INSERT INTO guardian (id, organizationId, userId, firstName, lastName, phone, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      guardianId,
      org.id,
      parentUserId,
      parentName.split(/\s+/)[0] ?? parentName,
      parentName.split(/\s+/).slice(1).join(" ") || "",
      parentPhone,
      now,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO guardianStudent (guardianId, studentId, relationship, createdAt)
       VALUES (?, ?, 'parent', ?)`,
    )
    .bind(guardianId, studentId, now)
    .run();

  // Create the enrollment.
  const enrollmentId = newId();
  await db
    .prepare(
      `INSERT INTO enrollment (id, organizationId, studentId, programId, programPackageId,
                                status, journeyState, enrolledAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'pending', 'enrolled', ?, ?, ?)`,
    )
    .bind(enrollmentId, org.id, studentId, pkg.programId, pkg.packageId, now, now, now)
    .run();

  await recordAudit(env, {
    organizationId: org.id,
    actorUserId: parentUserId,
    action: "enrollment.public_signup",
    entityType: "enrollment",
    entityId: enrollmentId,
    payload: {
      programId: pkg.programId,
      packageId: pkg.packageId,
      studentId,
      source: "public_catalog",
      accountFlow,
    },
  });

  const checkoutPath = `/me/checkout/${enrollmentId}`;

  // Always email a magic-link sign-in option. For the signed-in and
  // fresh-account paths it's a permanent backup login; for the merged-
  // existing path it's the only way the parent can finish checkout (we
  // never received their password). Errors here are non-fatal — the
  // signed-in / fresh paths still redirect into the portal.
  try {
    await auth.api.signInMagicLink({
      body: { email: parentEmail, callbackURL: checkoutPath },
      headers: request.headers,
      asResponse: true,
    });
  } catch (err) {
    console.warn("[enroll] magic link send failed:", err);
  }

  if (accountFlow === "merged_existing") {
    return data({
      magicLinkSent: parentEmail,
      enrollmentId,
      schoolName: org.name,
    });
  }

  // signed_in or fresh_account: forward the cookie header (if any) and
  // drop the parent into checkout immediately.
  const headers = cookieHeaders ?? undefined;
  return redirect(checkoutPath, headers ? { headers } : undefined);
}

export default function PublicEnrollment({ loaderData, actionData }: Route.ComponentProps) {
  const { org, packages, signedInEmail, signedInUserId } = loaderData;
  const [params] = useSearchParams();
  const preselectedPackage = params.get("package");
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const magicLinkSent =
    actionData && "magicLinkSent" in actionData ? actionData.magicLinkSent : null;

  if (magicLinkSent) {
    return (
      <div className="min-h-dvh bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
        <header className="border-b border-ink-200/60 dark:border-ink-800/60">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
            <Link
              to={`/schools/${org.publicSlug}`}
              className="text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400"
            >
              ← {org.name}
            </Link>
            <Link
              to="/"
              className="font-display text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50"
            >
              directio
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-6 py-16">
          <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/30">
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
              We've enrolled your driver. One more step.
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
              Check your email
            </h1>
            <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
              An account at this email — <strong>{magicLinkSent}</strong> — already exists.
              We sent a one-tap sign-in link there so you can open your portal and pay {org.name} for this enrollment. The link works for one hour.
            </p>
            <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
              If you don't see the email in a minute or two, check spam. You can also{" "}
              <Link to="/login" className="text-brand-600 hover:underline dark:text-brand-300">
                sign in another way
              </Link>{" "}
              — the enrollment is saved either way.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <header className="border-b border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to={`/schools/${org.publicSlug}`} className="text-sm text-ink-500 hover:text-ink-900 dark:text-ink-400">
            ← {org.name}
          </Link>
          <Link to="/" className="font-display text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            directio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <PageHeader
          eyebrow="Enroll"
          title={`Sign up your driver`}
          description={`Quick three-section form: who they are, who you are, what they're signing up for. After this, you'll go to checkout to pay ${org.name} directly.`}
        />

        <FormError message={actionData && "error" in actionData ? actionData.error : null} />

        {packages.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-600 dark:text-ink-300">
              This school hasn't published any packages yet. Contact them directly to enroll.
            </p>
          </Card>
        ) : (
          <Form method="post" className="flex flex-col gap-8">
            <Card>
              <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                The driver
              </h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="First name">
                  <TextInput name="studentFirst" type="text" required />
                </Field>
                <Field label="Last name">
                  <TextInput name="studentLast" type="text" required />
                </Field>
                <Field
                  label="Student email (optional)"
                  hint="If your child will sign in, use the email they'll use."
                >
                  <TextInput name="studentEmail" type="email" />
                </Field>
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                {signedInUserId ? "You" : "You (we'll make your account)"}
              </h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field label="Your name">
                  <TextInput name="parentName" type="text" required />
                </Field>
                <Field label="Phone">
                  <TextInput name="parentPhone" type="tel" />
                </Field>
                <Field
                  label="Your email"
                  hint={signedInUserId ? "Signed in." : "We'll send everything here."}
                >
                  <TextInput
                    name="parentEmail"
                    type="email"
                    required
                    defaultValue={signedInEmail ?? ""}
                    readOnly={Boolean(signedInUserId)}
                  />
                </Field>
              </div>
              {!signedInUserId && (
                <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
                  No password to choose. After you finish enrolling we'll
                  email you a one-tap sign-in link — the same link will
                  work every time you come back, unless you decide to set
                  a password later.
                </p>
              )}
              {signedInUserId && (
                <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                  Already signed in.{" "}
                  <Link to="/logout" className="text-brand-600 hover:underline dark:text-brand-300">
                    Sign out
                  </Link>{" "}
                  to enroll a child under a different account.
                </p>
              )}
            </Card>

            <Card>
              <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
                The package
              </h3>
              <Field label="">
                <Select
                  name="packageId"
                  defaultValue={preselectedPackage ?? packages[0]?.packageId ?? ""}
                  required
                >
                  {packages.map((p) => (
                    <option key={p.packageId} value={p.packageId}>
                      {p.programName} — {p.packageName} (
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                      }).format(p.priceCents / 100)}
                      )
                    </option>
                  ))}
                </Select>
              </Field>
            </Card>

            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-500 dark:text-ink-400">
                By continuing you agree to {org.name}'s policies.
              </p>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Enrolling…" : "Continue to checkout →"}
              </Button>
            </div>
          </Form>
        )}
      </main>
    </div>
  );
}
