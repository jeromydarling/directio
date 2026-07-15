import type { Route } from "./+types/support";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Support · directio" },
    {
      name: "description",
      content:
        "Get help with directio — email support, school admin resources, guidance for families and students, and answers to common login and billing questions.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const session = await getSession(request, env);
  let destination: string | null = null;
  if (session?.user) {
    const role = await env.DB.prepare(
      "SELECT role FROM member WHERE userId = ? ORDER BY createdAt ASC LIMIT 1",
    )
      .bind(session.user.id)
      .first<{ role: string }>();
    destination =
      !role ? "/onboarding"
      : role.role === "owner" || role.role === "admin" ? "/admin"
      : role.role === "instructor" ? "/instructor"
      : role.role === "parent" ? "/family" : "/me";
  }
  return { appEnv: env.APP_ENV ?? "unknown", signedIn: Boolean(session?.user), destination };
}

const FAQ = [
  {
    q: "I can't sign in.",
    a: "Use the magic-link sign-in on the login page — enter your email and we'll send you a one-time link. No password to remember, no password to reset.",
  },
  {
    q: "I can't find my school.",
    a: (
      <>
        Head to{" "}
        <a
          href="/me/find-school"
          className="text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-300"
        >
          find your school
        </a>{" "}
        and search by name or city. If your school isn&rsquo;t listed, they may not be on
        directio yet — ask them, or ask us.
      </>
    ),
  },
  {
    q: "I have a billing question.",
    a: "Email us and include your school's name — it's how we find your records fast. For tuition questions, your school is usually the quickest answer; for platform subscription questions, we are.",
  },
];

export default function Support({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative border-b border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-4xl px-4 pb-12 pt-16 sm:px-6 sm:pb-16 sm:pt-24">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            Support
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl dark:text-ink-50">
            How can we help?
          </h1>
          <p className="mt-6 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
            Real people read every message. Tell us what&rsquo;s going on and we&rsquo;ll point
            you in the right direction — usually the same day.
          </p>
        </div>
      </section>

      <section className="relative">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-4 md:grid-cols-3 md:gap-6">
            <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
              <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                Email us
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                For anything at all —{" "}
                <a
                  href="mailto:support@godirectio.com"
                  className="text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-300"
                >
                  support@godirectio.com
                </a>
                . We respond within 1 business day.
              </p>
            </div>

            <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
              <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                Schools
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                Running a school on directio? Help resources, setup guides, and the built-in
                help center live in{" "}
                <a
                  href="/admin"
                  className="text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-300"
                >
                  your admin console
                </a>
                . Can&rsquo;t find what you need there? Email us.
              </p>
            </div>

            <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40">
              <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-50">
                Families &amp; students
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                For questions about lessons, scheduling, or your course, contact your school
                first — their contact info is right on your portal. Stuck, or not getting a
                response? Escalate to us and we&rsquo;ll help.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
            Common questions
          </h2>
          <dl className="mt-8 space-y-6">
            {FAQ.map((item) => (
              <div
                key={item.q}
                className="rounded-2xl border border-ink-200 bg-white/70 p-6 backdrop-blur-sm dark:border-ink-800 dark:bg-ink-900/40"
              >
                <dt className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                  {item.q}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-sm text-ink-600 dark:text-ink-300">
            Didn&rsquo;t find your answer? Email{" "}
            <a
              href="mailto:support@godirectio.com"
              className="text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-300"
            >
              support@godirectio.com
            </a>{" "}
            — include your school&rsquo;s name if your question is about an enrollment or a
            payment, and we&rsquo;ll get back to you within 1 business day.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
