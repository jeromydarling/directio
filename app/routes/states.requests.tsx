import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/states.requests";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import { getSession } from "~/lib/session.server";
import { requireTenant } from "~/lib/tenant.server";
import { STATE_LABEL } from "~/lib/state-coverage";
import { MarketingShell } from "~/components/marketing-shell";

type RequestRow = {
  id: string;
  stateCode: string;
  title: string;
  description: string;
  status: "open" | "in_progress" | "resolved";
  cosignCount: number;
  alreadyCosigned: number;
};

export function meta(_: Route.MetaArgs) {
  return [
    { title: "State feature requests · directio" },
    {
      name: "description",
      content:
        "Open feature requests directio has filed with state DPS offices. Schools can co-sign to signal demand.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  const userId = session?.user?.id ?? null;
  // Resolve the user's primary org (if any) — co-sign is per-school,
  // not per-user, and we only let school admins/owners co-sign.
  let activeOrgId: string | null = null;
  if (userId) {
    const m = await env.DB.prepare(
      `SELECT m.organizationId, m.role FROM member m
        WHERE m.userId = ? AND m.role IN ('owner','admin')
        ORDER BY m.createdAt LIMIT 1`,
    )
      .bind(userId)
      .first<{ organizationId: string; role: string }>();
    activeOrgId = m?.organizationId ?? null;
  }

  const rows = await env.DB.prepare(
    `SELECT r.id, r.stateCode, r.title, r.description, r.status,
            (SELECT COUNT(*) FROM state_feature_cosign WHERE featureRequestId = r.id) AS cosignCount,
            CASE WHEN ? IS NULL THEN 0
                 WHEN EXISTS (
                   SELECT 1 FROM state_feature_cosign
                    WHERE featureRequestId = r.id AND organizationId = ?
                 ) THEN 1
                 ELSE 0 END AS alreadyCosigned
       FROM state_feature_request r
      WHERE r.status != 'resolved'
      ORDER BY cosignCount DESC, r.stateCode, r.createdAt`,
  )
    .bind(activeOrgId, activeOrgId)
    .all<RequestRow>();

  return {
    requests: rows.results,
    appEnv: env.APP_ENV ?? "unknown",
    signedIn: Boolean(session?.user),
    canCosign: Boolean(activeOrgId),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/login");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return data({ error: "Missing request." }, { status: 400 });

  const now = Date.now();
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO state_feature_cosign
       (id, featureRequestId, organizationId, cosignedByUserId, cosignedAt)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(featureRequestId, organizationId) DO NOTHING`,
  )
    .bind(id, requestId, tenant.organization.id, tenant.user.id, now)
    .run();
  await recordAudit(env, {
    organizationId: tenant.organization.id,
    actorUserId: tenant.user.id,
    action: "state_feature_request.cosigned",
    entityType: "state_feature_request",
    entityId: requestId,
    payload: {},
  });
  return redirect("/states/requests");
}

export default function StateFeatureRequests({ loaderData }: Route.ComponentProps) {
  const { requests, appEnv, signedIn, canCosign } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <MarketingShell signedIn={signedIn} destination="/signup" appEnv={appEnv}>
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
          State feature requests
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-ink-900 sm:text-4xl dark:text-ink-50">
          What we're asking states for
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-600 sm:text-base dark:text-ink-300">
          When a state could automate something but doesn't yet, we file it
          here. Schools can co-sign — when we walk into a DPS office with a
          co-signed list of customer demand, those conversations land
          differently.
        </p>

        {requests.length === 0 ? (
          <p className="mt-8 text-sm text-ink-500 dark:text-ink-400">
            No open requests right now. We'll add more as we find them.
          </p>
        ) : (
          <ul className="mt-8 flex flex-col gap-4">
            {requests.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <p className="text-xs font-mono uppercase tracking-wider text-ink-500 dark:text-ink-400">
                      {STATE_LABEL[r.stateCode] ?? r.stateCode} ({r.stateCode})
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                      {r.title}
                    </h2>
                  </div>
                  <span
                    className={
                      r.status === "in_progress"
                        ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                        : "rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700 dark:bg-ink-800 dark:text-ink-200"
                    }
                  >
                    {r.status === "in_progress" ? "In progress" : "Open"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-700 dark:text-ink-200">
                  {r.description}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink-200 pt-3 dark:border-ink-800">
                  <span className="text-xs text-ink-500 dark:text-ink-400">
                    Co-signed by{" "}
                    <strong className="text-ink-800 dark:text-ink-100">
                      {r.cosignCount}
                    </strong>{" "}
                    school{r.cosignCount === 1 ? "" : "s"}
                  </span>
                  {canCosign ? (
                    r.alreadyCosigned ? (
                      <span className="text-xs text-emerald-700 dark:text-emerald-300">
                        ✓ Your school has co-signed
                      </span>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="requestId" value={r.id} />
                        <button
                          type="submit"
                          disabled={submitting}
                          className="rounded-full bg-ink-900 px-3 py-1 text-xs font-medium text-ink-50 dark:bg-ink-50 dark:text-ink-900"
                        >
                          Co-sign as my school
                        </button>
                      </Form>
                    )
                  ) : signedIn ? (
                    <span className="text-xs text-ink-500 dark:text-ink-400">
                      Only school admins can co-sign.
                    </span>
                  ) : (
                    <Link
                      to="/login?next=/states/requests"
                      className="text-xs text-brand-600 hover:underline dark:text-brand-300"
                    >
                      Sign in to co-sign →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </MarketingShell>
  );
}
