// DRAFT — reviewed by counsel? NO. Have a lawyer review before marketing this as binding.
import type { Route } from "./+types/privacy";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Privacy Policy · directio" },
    {
      name: "description",
      content:
        "How directio collects, uses, and protects your data — including students' records, payment metadata, subprocessors, and your rights to access or delete.",
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

const SUBPROCESSORS = [
  {
    name: "Cloudflare",
    purpose: "Hosting, storage, email delivery",
    receives:
      "All application data, lesson assets, and transactional email content, as our core infrastructure provider.",
  },
  {
    name: "Stripe",
    purpose: "Payments",
    receives:
      "Card details (entered directly into Stripe, never seen by us), payer name, email, and transaction amounts.",
  },
  {
    name: "Anthropic",
    purpose: "AI help center and quiz assistance",
    receives:
      "The text of help questions and quiz interactions; no student rosters or payment data.",
  },
  {
    name: "Cloudflare Workers AI",
    purpose: "Lesson narration and translation",
    receives: "Lesson text being narrated or translated; no personal information.",
  },
  {
    name: "DeepL",
    purpose: "Premium lesson translations",
    receives: "Lesson content text only; no personal information.",
  },
  {
    name: "Google Translate",
    purpose: "Premium lesson translations",
    receives: "Lesson content text only; no personal information.",
  },
  {
    name: "Mapbox",
    purpose: "Maps",
    receives: "Addresses and coordinates shown on maps, such as school and pickup locations.",
  },
  {
    name: "Perplexity",
    purpose: "State-information research",
    receives: "Research queries about state requirements; no personal or student data.",
  },
  {
    name: "ElevenLabs",
    purpose: "Audio narration",
    receives: "Lesson and help-center text submitted for narration; no personal information.",
  },
];

export default function Privacy({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative border-b border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-16 sm:px-6 sm:pb-16 sm:pt-24">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            Legal
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl dark:text-ink-50">
            Privacy Policy
          </h1>
          <p className="mt-6 text-sm italic text-ink-500 dark:text-ink-400">
            Last updated: July 15, 2026. Questions about this policy? Email{" "}
            <a
              href="mailto:support@godirectio.com"
              className="underline underline-offset-2"
            >
              support@godirectio.com
            </a>
            .
          </p>
        </div>
      </section>

      <section className="relative">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <article className="prose max-w-none text-ink-600 dark:text-ink-300">
            <p>
              directio is software that driving schools use to run their operations, and that
              families use to get a teenager from enrollment to a driver&rsquo;s license. That
              means we handle data about minors, about families&rsquo; payments, and about
              schools&rsquo; businesses. This policy explains what we collect, why, who else
              touches it, and what rights you have. No legalese where plain English will do.
            </p>

            <h2>What we collect</h2>
            <ul>
              <li>
                <strong>Account information.</strong> Name, email address, role (owner,
                instructor, parent, student), and school affiliation.
              </li>
              <li>
                <strong>Student records.</strong> Enrollment details, lesson progress, quiz
                results, instruction hours, scheduling history, and compliance milestones —
                including records about students under 18, entered by their school or their
                parent/guardian.
              </li>
              <li>
                <strong>Payment metadata.</strong> What was purchased, when, for how much, and
                its refund status. <strong>Card numbers never touch directio</strong> — they are
                entered directly into Stripe, our payment processor.
              </li>
              <li>
                <strong>Usage data.</strong> Pages visited, features used, and technical logs
                (IP address, browser type) that help us keep the platform secure and fast.
              </li>
            </ul>

            <h2>Students under 18</h2>
            <p>
              Most students on directio are minors between 14 and 18. We treat their data with
              particular care:
            </p>
            <ul>
              <li>
                Data about a minor is provided by the enrolling school or by the student&rsquo;s
                parent or legal guardian — not collected from the student behind their family&rsquo;s
                back.
              </li>
              <li>
                It is used <strong>solely to deliver driver-education services</strong>: lessons,
                scheduling, compliance tracking, and credentials.
              </li>
              <li>
                It is <strong>never sold</strong> and <strong>never used for advertising</strong> —
                to minors or anyone else.
              </li>
              <li>
                Parents and guardians may request access to, correction of, or deletion of their
                child&rsquo;s data by emailing{" "}
                <a href="mailto:support@godirectio.com">support@godirectio.com</a>. Where a
                record is a compliance record the school is legally required to keep, we will
                explain what can and cannot be deleted and why.
              </li>
            </ul>

            <h2>Subprocessors</h2>
            <p>
              We use a small set of service providers to run the platform. Each receives only
              what it needs:
            </p>
          </article>

          <div className="my-6 overflow-x-auto rounded-2xl border border-ink-200 dark:border-ink-800">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-100/50 dark:border-ink-800 dark:bg-ink-900/40">
                  <th className="px-4 py-3 font-display font-semibold text-ink-900 dark:text-ink-50">
                    Subprocessor
                  </th>
                  <th className="px-4 py-3 font-display font-semibold text-ink-900 dark:text-ink-50">
                    Purpose
                  </th>
                  <th className="px-4 py-3 font-display font-semibold text-ink-900 dark:text-ink-50">
                    What they receive
                  </th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map((s) => (
                  <tr
                    key={s.name}
                    className="border-b border-ink-200/60 last:border-b-0 dark:border-ink-800/60"
                  >
                    <td className="whitespace-nowrap px-4 py-3 align-top font-medium text-ink-900 dark:text-ink-50">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 align-top text-ink-600 dark:text-ink-300">
                      {s.purpose}
                    </td>
                    <td className="px-4 py-3 align-top text-ink-600 dark:text-ink-300">
                      {s.receives}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <article className="prose max-w-none text-ink-600 dark:text-ink-300">
            <p>
              If we add a subprocessor that handles personal data, we will update this table
              before it goes live.
            </p>

            <h2>Data retention</h2>
            <p>
              We keep data as long as it is needed to provide the service. Active school and
              student records stay for the life of the account. Because driver education is
              regulated, compliance records (credentials issued, instruction hours, audit logs)
              may be retained after an account closes for as long as state law requires the
              school to keep them. When a school leaves the platform, it can export its data;
              after the retention window, we delete or anonymize what remains.
            </p>

            <h2>Your rights</h2>
            <p>
              Wherever you live, we extend the same core rights, aligned with GDPR and CCPA:
            </p>
            <ul>
              <li>
                <strong>Access</strong> — ask for a copy of the personal data we hold about you
                or your child.
              </li>
              <li>
                <strong>Correction</strong> — fix inaccurate information.
              </li>
              <li>
                <strong>Deletion</strong> — request removal of personal data, subject to
                compliance-retention obligations we will explain if they apply.
              </li>
            </ul>
            <p>
              To exercise any of these, email{" "}
              <a href="mailto:support@godirectio.com">support@godirectio.com</a>. We respond
              within 30 days, and we will verify your identity before releasing or deleting
              anything.
            </p>

            <h2>Cookies</h2>
            <p>
              We use <strong>session cookies only</strong> — the cookie that keeps you signed
              in. There are no third-party advertising trackers, no cross-site tracking pixels,
              and no analytics cookies that follow you around the internet.
            </p>

            <h2>Security</h2>
            <ul>
              <li>All traffic is encrypted in transit (TLS).</li>
              <li>
                Every school&rsquo;s data is isolated by tenant: queries are scoped so one
                school can never read another&rsquo;s records.
              </li>
              <li>
                Compliance-sensitive actions — credentials issued, fees changed, records
                edited — are written to an audit log with who did it and when.
              </li>
              <li>
                Access to production data is limited to the few people who operate the platform,
                and only when their job requires it.
              </li>
            </ul>

            <h2>If something goes wrong</h2>
            <p>
              If we experience a data breach that affects your personal data, we will notify
              affected schools and account holders without undue delay — and within any timeline
              applicable law requires — with a plain description of what happened, what data was
              involved, and what we are doing about it.
            </p>

            <h2>Changes to this policy</h2>
            <p>
              When we change this policy, we update the &ldquo;Last updated&rdquo; date above.
              For material changes — especially anything affecting minors&rsquo; data or the
              subprocessor list — we notify account holders by email or in-app notice before the
              change takes effect.
            </p>
          </article>

          <p className="mt-12 border-t border-ink-200/60 pt-6 text-xs text-ink-500 dark:border-ink-800/60 dark:text-ink-400">
            This page is provided for transparency and does not constitute legal advice.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
