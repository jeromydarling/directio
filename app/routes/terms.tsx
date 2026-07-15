// DRAFT — reviewed by counsel? NO. Have a lawyer review before marketing this as binding.
import type { Route } from "./+types/terms";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Terms of Service · directio" },
    {
      name: "description",
      content:
        "The terms that govern your use of directio — accounts, payments, content ownership, compliance responsibilities, and liability, in plain English.",
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

export default function Terms({ loaderData }: Route.ComponentProps) {
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
            Terms of Service
          </h1>
          <p className="mt-6 text-sm italic text-ink-500 dark:text-ink-400">
            Last updated: July 15, 2026. Questions about these terms? Email{" "}
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
              These terms are an agreement between you and directio, Inc.
              (&ldquo;directio&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) covering your use of
              the directio platform at godirectio.com. By creating an account or using the
              platform, you agree to them. We&rsquo;ve written them in plain English on purpose —
              if anything is unclear, ask us before you rely on it.
            </p>

            <h2>1. What directio is</h2>
            <p>
              directio is software for driving schools. Schools use it to run enrollment,
              classroom lessons, scheduling, payments, and state compliance tracking. Families
              and students use it to enroll, learn, schedule lessons, and track progress toward
              a license.
            </p>
            <p>
              An important distinction: <strong>every driving school on directio is an
              independent business.</strong> We provide the software; the school provides the
              instruction. Schools are solely responsible for the quality of their teaching,
              the conduct of their instructors, their vehicles, their pricing, and their
              compliance with the laws of their state. When you enroll in a course, your
              contract for instruction is with the school — not with us.
            </p>

            <h2>2. Accounts and eligibility</h2>
            <ul>
              <li>
                <strong>School owners and administrators</strong> must be at least 18 years old
                and authorized to act on behalf of their school.
              </li>
              <li>
                <strong>Students</strong> may be minors (typically 14&ndash;18). Student accounts
                are created and used under the supervision of a parent or legal guardian, or of
                the enrolling school. If you are a parent creating an account for your child,
                you are agreeing to these terms on their behalf.
              </li>
              <li>
                You are responsible for keeping your login credentials secure and for activity
                that happens under your account. Tell us right away if you believe your account
                has been compromised.
              </li>
              <li>
                Account information you provide must be accurate. Compliance records — hours,
                credentials, milestones — depend on it.
              </li>
            </ul>

            <h2>3. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Falsify compliance records, instruction hours, or credentials.</li>
              <li>
                Access data belonging to another school, family, or student, or attempt to
                bypass tenant isolation.
              </li>
              <li>
                Use the platform to harass, threaten, or endanger anyone — students, parents,
                instructors, or staff.
              </li>
              <li>
                Scrape, reverse-engineer, or resell the platform, or probe it for
                vulnerabilities outside of a coordinated disclosure.
              </li>
              <li>Upload malware or content that infringes someone else&rsquo;s rights.</li>
            </ul>
            <p>
              We may suspend or remove accounts that violate these rules, and we will do so
              quickly when student safety or compliance integrity is at stake.
            </p>

            <h2>4. Payments</h2>
            <p>
              All payments on directio are processed by <strong>Stripe</strong>. Card numbers
              never touch our servers.
            </p>
            <ul>
              <li>
                <strong>Platform fees.</strong> directio charges schools a subscription and/or a
                platform fee on transactions, as shown in the school&rsquo;s billing settings
                before they are charged.
              </li>
              <li>
                <strong>Tuition and school fees.</strong> When a family pays tuition, that money
                goes to the school through the school&rsquo;s own Stripe account. The purchase
                contract is between the family and the school, and{" "}
                <strong>directio is not the merchant of record for tuition</strong>. The school
                sets its own prices, fee schedule, and refund terms, which are shown before
                checkout.
              </li>
              <li>
                Refunds are covered by our{" "}
                <a href="/refund-policy">Refund Policy</a>.
              </li>
            </ul>

            <h2>5. State compliance is the school&rsquo;s responsibility</h2>
            <p>
              directio models state requirements — hours, credentials, eligibility milestones —
              and helps schools track them. But the tooling is an aid, not a substitute for the
              school&rsquo;s own legal obligations. Each school is responsible for holding the
              licenses its state requires, for verifying that its programs meet state law, and
              for the accuracy of records it submits to its regulator. We tell you honestly how
              deep our support for each state goes; where our coverage is a guided checklist
              rather than an integration, the school must do the checking.
            </p>

            <h2>6. Content and ownership</h2>
            <ul>
              <li>
                <strong>Your content is yours.</strong> Lessons a school writes, edits a school
                makes to installed curriculum, uploaded media, and school branding all belong to
                the school. Student records belong to the school and family they concern.
              </li>
              <li>
                <strong>Our platform is ours.</strong> The directio software, design, and the
                master copies of our starter curriculum packs remain our property. When a school
                installs a curriculum pack, it gets a copy it may freely edit for its own use —
                but not the right to resell or redistribute the original.
              </li>
              <li>
                You grant us the limited license needed to host, display, and back up your
                content so the platform works. Nothing more.
              </li>
            </ul>

            <h2>7. Service availability</h2>
            <p>
              We work hard to keep directio fast and available, but we provide it{" "}
              <em>as is</em> and <em>as available</em>, without warranties of uninterrupted or
              error-free operation. We may perform maintenance, and features may change over
              time. If we ever discontinue the platform, we will give schools reasonable notice
              and a way to export their data.
            </p>

            <h2>8. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by law, directio is not liable for indirect,
              incidental, special, or consequential damages — including lost profits, lost data,
              or regulatory penalties arising from a school&rsquo;s own compliance failures. Our
              total liability for any claim is capped at the amount you paid us in the twelve
              months before the claim arose. Nothing in these terms limits liability that cannot
              be limited under applicable law.
            </p>

            <h2>9. Termination</h2>
            <p>
              You can close your account at any time. Schools can cancel their subscription as
              described in the <a href="/refund-policy">Refund Policy</a>. We may suspend or
              terminate accounts that violate these terms, fail to pay, or create risk for other
              users. After termination, schools have a reasonable window to export their data;
              we retain records only as described in our{" "}
              <a href="/privacy">Privacy Policy</a> and as required for compliance and audit
              purposes.
            </p>

            <h2>10. Governing law</h2>
            <p>
              These terms are governed by the laws of the State of Minnesota, USA, without
              regard to conflict-of-law rules. Disputes will be resolved in the state or federal
              courts located in Minnesota, and both parties consent to that venue.
            </p>

            <h2>11. Changes to these terms</h2>
            <p>
              We may update these terms as the product evolves. If a change is material, we will
              notify account holders by email or an in-app notice at least 14 days before it
              takes effect. Continuing to use the platform after that date means you accept the
              updated terms. The &ldquo;Last updated&rdquo; date at the top of this page always
              reflects the current version.
            </p>

            <h2>12. Contact</h2>
            <p>
              Questions, concerns, or notices under these terms should go to{" "}
              <a href="mailto:support@godirectio.com">support@godirectio.com</a>.
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
