import { Link, redirect } from "react-router";
import type { Route } from "./+types/schools.$slug";
import { getSession } from "~/lib/session.server";
import { Card, EmptyState, LinkButton } from "~/components/ui";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  publicSlug: string;
  publicTagline: string | null;
  publicAbout: string | null;
  publicPublishedAt: number | null;
  jurisdiction: string | null;
  logo: string | null;
  brandColor: string | null;
  stripeChargesEnabled: number;
};

type ProgramRow = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  packageId: string | null;
  packageName: string | null;
  packagePriceCents: number | null;
  packageBtwLessons: number | null;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const db = env.DB;

  const org = await db
    .prepare(
      `SELECT id, name, slug, publicSlug, publicTagline, publicAbout,
              publicPublishedAt, jurisdiction, logo, brandColor, stripeChargesEnabled
         FROM organization
         WHERE publicSlug = ? AND publicPublishedAt IS NOT NULL`,
    )
    .bind(params.slug)
    .first<OrgRow>();
  if (!org) throw new Response("Not found", { status: 404 });

  // Active programs + their cheapest package (one row per program/package combo).
  const programs = await db
    .prepare(
      `SELECT p.id, p.name, p.kind, p.description,
              pp.id AS packageId, pp.name AS packageName,
              pp.priceCents AS packagePriceCents, pp.btwLessonCount AS packageBtwLessons
         FROM program p
         LEFT JOIN programPackage pp ON pp.programId = p.id AND pp.active = 1
         WHERE p.organizationId = ? AND p.active = 1
         ORDER BY p.name, pp.priceCents`,
    )
    .bind(org.id)
    .all<ProgramRow>();

  const session = await getSession(request, env);

  return {
    org,
    programs: programs.results,
    signedIn: Boolean(session?.user),
  };
}

export default function PublicSchoolPage({ loaderData }: Route.ComponentProps) {
  const { org, programs, signedIn } = loaderData;
  const grouped = new Map<string, ProgramRow[]>();
  for (const p of programs) {
    const arr = grouped.get(p.id) ?? [];
    arr.push(p);
    grouped.set(p.id, arr);
  }

  return (
    <div className="min-h-dvh bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
      <header className="border-b border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="group inline-flex items-baseline gap-1">
            <span className="font-display text-xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              directio
            </span>
            <span className="h-1.5 w-1.5 translate-y-[-2px] rounded-full bg-brand-500" />
          </Link>
          <div className="flex items-center gap-3">
            {signedIn ? (
              <LinkButton to="/me" variant="ghost">
                Your account
              </LinkButton>
            ) : (
              <>
                <Link
                  to={`/login?next=/schools/${org.publicSlug}`}
                  className="text-sm font-medium text-ink-700 transition hover:text-ink-900 dark:text-ink-200"
                >
                  Sign in
                </Link>
                <LinkButton to={`/schools/${org.publicSlug}/enroll`}>Enroll →</LinkButton>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: org.brandColor
              ? `radial-gradient(circle at 50% 0%, ${org.brandColor}1A, transparent 50%)`
              : undefined,
          }}
        >
          <div className="absolute left-1/2 top-[-10%] h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200/40 via-brand-100/20 to-transparent blur-3xl dark:from-brand-900/30 dark:via-brand-800/20" />
        </div>

        <div className="mx-auto max-w-5xl px-6 pt-16 pb-12">
          <p className="text-xs uppercase tracking-wider text-brand-600 dark:text-brand-300">
            {org.jurisdiction?.replace("US-", "") ?? ""} driver education
          </p>
          <h1 className="mt-3 font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            {org.name}
          </h1>
          {org.publicTagline && (
            <p className="mt-4 max-w-2xl text-xl leading-relaxed text-ink-700 dark:text-ink-200">
              {org.publicTagline}
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <LinkButton to={`/schools/${org.publicSlug}/enroll`}>Enroll your driver →</LinkButton>
            <a href="#programs" className="text-sm font-medium text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50">
              See programs
            </a>
          </div>
        </div>
      </section>

      {org.publicAbout && (
        <section className="border-t border-ink-200/60 dark:border-ink-800/60">
          <div className="mx-auto max-w-3xl px-6 py-16">
            <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
              About us
            </p>
            <p className="mt-3 whitespace-pre-line text-lg leading-relaxed text-ink-800 dark:text-ink-100">
              {org.publicAbout}
            </p>
          </div>
        </section>
      )}

      <section id="programs" className="border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-600 dark:text-brand-300">
            Programs
          </p>
          <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            What we offer
          </h2>

          {programs.length === 0 ? (
            <EmptyState
              title="Programs coming soon"
              description="This school is still setting up. Check back shortly."
            />
          ) : (
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {[...grouped.values()].map((rows) => {
                const head = rows[0];
                const packages = rows.filter((r) => r.packageId);
                return (
                  <li key={head.id}>
                    <Card>
                      <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                        {head.kind}
                      </p>
                      <p className="mt-1 font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
                        {head.name}
                      </p>
                      {head.description && (
                        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                          {head.description}
                        </p>
                      )}
                      {packages.length > 0 ? (
                        <ul className="mt-4 flex flex-col gap-2">
                          {packages.map((p) => (
                            <li
                              key={p.packageId}
                              className="flex items-baseline justify-between gap-3 border-t border-ink-200/60 pt-3 first:border-0 first:pt-0 dark:border-ink-800/60"
                            >
                              <div>
                                <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                                  {p.packageName}
                                </p>
                                <p className="text-xs text-ink-500 dark:text-ink-400">
                                  {p.packageBtwLessons ?? 0} BTW lesson
                                  {p.packageBtwLessons === 1 ? "" : "s"}
                                </p>
                              </div>
                              <p className="font-display text-xl font-semibold text-ink-900 dark:text-ink-50">
                                {p.packagePriceCents != null
                                  ? new Intl.NumberFormat("en-US", {
                                      style: "currency",
                                      currency: "USD",
                                    }).format(p.packagePriceCents / 100)
                                  : "Contact us"}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-ink-500 dark:text-ink-400">
                          Contact the school for pricing.
                        </p>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-12 flex items-center justify-center">
            <LinkButton to={`/schools/${org.publicSlug}/enroll`}>
              Enroll your driver →
            </LinkButton>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-8 text-sm text-ink-500 dark:text-ink-400">
          <p>
            Powered by{" "}
            <Link to="/" className="font-medium text-ink-700 hover:underline dark:text-ink-200">
              directio
            </Link>
          </p>
          <p>
            Payments by Stripe ·{" "}
            {org.stripeChargesEnabled ? "Online checkout available" : "Contact school for payment"}
          </p>
        </div>
      </footer>
    </div>
  );
}
