import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin._onboarding";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, LinkButton, Button } from "~/components/ui";

type OrgRow = {
  id: string;
  name: string;
  jurisdiction: string | null;
  brandColor: string | null;
  logo: string | null;
  stripeAccountId: string | null;
  stripeChargesEnabled: number;
  onboardingState: string | null;
  onboardingCompletedAt: number | null;
};

type OnboardingState = {
  branding?: boolean;
  jurisdictionPack?: boolean;
  stripe?: boolean;
  import?: boolean;
  team?: boolean;
  btwFlow?: boolean;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const db = context.cloudflare.env.DB;

  const org = await db
    .prepare(
      `SELECT id, name, jurisdiction, brandColor, logo,
              stripeAccountId, stripeChargesEnabled,
              onboardingState, onboardingCompletedAt
         FROM organization WHERE id = ?`,
    )
    .bind(tenant.organization.id)
    .first<OrgRow>();
  if (!org) throw new Response("Org not found", { status: 404 });

  const state: OnboardingState = org.onboardingState ? JSON.parse(org.onboardingState) : {};
  // Auto-detect a few states so the checklist doesn't lie if the
  // admin already did things outside this page.
  state.branding ||= Boolean(org.brandColor || org.logo);
  state.stripe ||= Boolean(org.stripeAccountId && org.stripeChargesEnabled);

  const installedPack = await db
    .prepare(
      `SELECT 1 FROM school_pack_install spi
         JOIN content_pack_version cpv ON cpv.id = spi.contentPackVersionId
         JOIN content_pack cp ON cp.id = cpv.contentPackId
         WHERE spi.organizationId = ? AND (cp.scope = 'state' OR cp.scope = 'national')
         LIMIT 1`,
    )
    .bind(tenant.organization.id)
    .first();
  state.jurisdictionPack ||= Boolean(installedPack);

  const studentCount = await db
    .prepare("SELECT COUNT(*) AS n FROM student WHERE organizationId = ?")
    .bind(tenant.organization.id)
    .first<{ n: number }>();
  state.import ||= (studentCount?.n ?? 0) > 0;

  const teamCount = await db
    .prepare("SELECT COUNT(*) AS n FROM instructor WHERE organizationId = ?")
    .bind(tenant.organization.id)
    .first<{ n: number }>();
  state.team ||= (teamCount?.n ?? 0) > 0;

  const btwStepsCount = await db
    .prepare("SELECT COUNT(*) AS n FROM school_btw_step WHERE organizationId = ?")
    .bind(tenant.organization.id)
    .first<{ n: number }>();
  state.btwFlow ||= (btwStepsCount?.n ?? 0) > 0;

  return { org, state };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin")
    return data({ error: "Not allowed." }, { status: 403 });
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent === "mark-done") {
    await env.DB.prepare(
      "UPDATE organization SET onboardingCompletedAt = ? WHERE id = ?",
    )
      .bind(Date.now(), tenant.organization.id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "onboarding.completed",
      entityType: "organization",
      entityId: tenant.organization.id,
    });
    return redirect("/admin");
  }
  return data({ error: "Unknown action." }, { status: 400 });
}

const STEPS: Array<{
  key: keyof OnboardingState;
  title: string;
  body: string;
  to: string;
  cta: string;
}> = [
  {
    key: "branding",
    title: "Make it yours",
    body: "Add your school's name, colors, and (optional) logo so families recognize you in the portal.",
    to: "/admin/settings",
    cta: "Open settings",
  },
  {
    key: "jurisdictionPack",
    title: "Install your state curriculum",
    body: "Pick your state's overlay so lessons use the right hours, agency names, and credential terminology.",
    to: "/admin/library",
    cta: "Browse packs",
  },
  {
    key: "team",
    title: "Add your team",
    body: "Add instructors and vehicles so you can start booking behind-the-wheel lessons.",
    to: "/admin/instructors",
    cta: "Add instructor",
  },
  {
    key: "btwFlow",
    title: "Configure your BTW flow",
    body: "Tell your students what happens when they're ready for the road test — your state's steps, your school's steps.",
    to: "/admin/settings/btw-flow",
    cta: "Configure flow",
  },
  {
    key: "import",
    title: "Bring your students over",
    body: "Paste or upload your existing roster. AI will normalize the columns; you review before anything's saved.",
    to: "/admin/import",
    cta: "Import students",
  },
  {
    key: "stripe",
    title: "Connect Stripe (optional)",
    body: "Enable online payments. Families can pay in full, monthly, or with Affirm/Klarna. You can do this later.",
    to: "/admin/settings/payments",
    cta: "Connect Stripe",
  },
];

export default function OnboardingChecklist({ loaderData }: Route.ComponentProps) {
  const { org, state } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const completed = STEPS.filter((s) => state[s.key]).length;
  const total = STEPS.length;
  const pct = Math.round((completed / total) * 100);
  const allDone = completed === total;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Onboarding"
        title={`Welcome to directio, ${firstWord(org.name)}`}
        description="A short checklist to get your school running. You can come back to this any time from settings."
        actions={
          allDone ? (
            <Form method="post">
              <input type="hidden" name="intent" value="mark-done" />
              <Button type="submit" disabled={submitting}>
                Finish onboarding →
              </Button>
            </Form>
          ) : (
            <LinkButton to="/admin" variant="ghost">
              Skip to dashboard
            </LinkButton>
          )
        }
      />

      <Card>
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-ink-600 dark:text-ink-300">
            {completed} of {total} steps complete
          </p>
          <p className="text-xs text-ink-500 dark:text-ink-400">{pct}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </Card>

      <ul className="flex flex-col gap-3">
        {STEPS.map((s, i) => {
          const done = Boolean(state[s.key]);
          return (
            <li
              key={s.key}
              className={[
                "flex items-start justify-between gap-6 rounded-2xl border p-5 transition",
                done
                  ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
                  : "border-ink-200 bg-white/70 dark:border-ink-800 dark:bg-ink-900/40",
              ].join(" ")}
            >
              <div className="flex items-start gap-4">
                <span
                  className={[
                    "grid h-9 w-9 place-items-center rounded-full font-display text-sm font-semibold",
                    done
                      ? "bg-emerald-500 text-white"
                      : "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
                  ].join(" ")}
                >
                  {done ? "✓" : i + 1}
                </span>
                <div>
                  <p className="text-base font-semibold text-ink-900 dark:text-ink-50">{s.title}</p>
                  <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{s.body}</p>
                </div>
              </div>
              <LinkButton to={s.to} variant={done ? "ghost" : "primary"}>
                {done ? "Review" : s.cta}
              </LinkButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function firstWord(s: string): string {
  return s.split(/\s+/)[0] ?? s;
}
