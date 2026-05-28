import { Link } from "react-router";
import type { Route } from "./+types/for-instructors";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "For instructors · directio" },
    {
      name: "description",
      content:
        "directio is built for the instructor first — daily user, mobile-first, one-handed, signal-poor-friendly. Today view, structured rubric, two-tap sign-off, open-shift queue, pay transparency, cross-school identity.",
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
    if (!role) destination = "/onboarding";
    else if (role.role === "instructor") destination = "/instructor";
    else if (role.role === "owner" || role.role === "admin") destination = "/admin";
    else if (role.role === "parent") destination = "/family";
    else destination = "/me";
  }
  return {
    appEnv: env.APP_ENV ?? "unknown",
    signedIn: Boolean(session?.user),
    destination,
  };
}

type Cluster = {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  features: { name: string; body: string }[];
};

const CLUSTERS: Cluster[] = [
  {
    id: "daily",
    eyebrow: "Daily, in-car, one-handed",
    title: "The today view is the app",
    blurb:
      "You spend six to eight hours a day in a car. The phone is the interface. Every daily action works one-handed, in three taps, with poor cell signal, and survives a parking-lot interruption.",
    features: [
      {
        name: "One screen for the whole day",
        body:
          "Time, student, pickup address with one-tap maps link, vehicle assigned, lesson number in the student's progression, current skill focus, parent's phone, last lesson's notes inline. Everything you need before the next pickup, no scroll required.",
      },
      {
        name: "BTW lesson plan auto-surfaces",
        body:
          "For each BTW lesson the app shows the right plan from the platform's MN-aligned 6-hour progression — controls and parking lot on lesson 1, highway on lesson 4, test prep on lesson 6. No more 'what was I supposed to teach today?'",
      },
      {
        name: "Carry-over notes",
        body:
          "Whatever you flagged at the previous lesson's sign-off (\"work on highway merging next\") shows up automatically at the top of the next appointment with that student.",
      },
      {
        name: "Pay transparency on every visit",
        body:
          "Earned this period, pending payout, average per lesson — the three tiles at the top of your today page. No spreadsheet, no calling the office.",
      },
    ],
  },
  {
    id: "signoff",
    eyebrow: "Sign-off",
    title: "Two taps to wrap a lesson honestly",
    blurb:
      "Sign-off is where you record what really happened. A freeform textarea is fine for context, useless as data. directio asks you to rate fifteen specific BTW skills with one tap each — and the data flows into the parent's progress summary, the credential-readiness decision, and your own scorecard.",
    features: [
      {
        name: "Fifteen-skill BTW rubric",
        body:
          "Pre-drive · vehicle control · lane positioning · lane changes · following distance · scanning · speed control · intersections · turns · backing · parallel parking · three-point turn · hill parking · highway · overall road-test readiness. Tap a proficiency level per skill — needs work / developing / proficient / independent — only for the skills you observed.",
      },
      {
        name: "Lesson notes that go somewhere",
        body:
          "Freeform notes are visible to school admin and the family. Carry-over focus for the next lesson is prefilled at the top of the next appointment with that student.",
      },
      {
        name: "Credential readiness recommendation",
        body:
          "When every skill is at proficient and overall road-test readiness is at independent, the credential workflow surfaces the student as ready for the school admin to issue. Your rubric data is what drives that recommendation — your judgment counts.",
      },
      {
        name: "Two-ping geolocation evidence (when your school opts in)",
        body:
          "One ping when you confirm the lesson start, one when you sign off complete. Not a tracked route. Not visible to parents. It's there so when a parent calls in furious that you 'took my kid on the freeway,' the school has actual evidence on either side. It defends good instructors first; police is a side effect.",
      },
    ],
  },
  {
    id: "shifts",
    eyebrow: "Shifts and coverage",
    title: "Open shifts, substitute coverage, one tap each",
    blurb:
      "Most schools handle no-shows by texting the group chat at 4pm asking who can pick up the slot. directio runs an open-shift queue and a coverage-request flow that work the same way — but on your phone, with the school's pay rules already computed.",
    features: [
      {
        name: "Open-shift offers",
        body:
          "When admin posts an extra lesson (or a no-show creates a gap), eligible instructors see it on their /instructor page. Tap 'Claim shift' — first to write wins. The first-write-wins logic is in the database, not in race-prone JS, so two instructors tapping simultaneously can't both end up with the lesson.",
      },
      {
        name: "Substitute coverage requests",
        body:
          "Got a conflict on Tuesday? Tap 'Need coverage' on the lesson. It becomes an open shift on everyone else's queue. Whoever claims it first gets it; you're off the hook.",
      },
      {
        name: "Vehicle check-out / check-in",
        body:
          "At shift start: pick the car (compliance-blocked cars don't show up), enter the start odometer, fuel level, walk-around inspection checkbox. At shift end: end odometer, fuel level, optional 'flag an issue' field that auto-takes the car out of service if you report anything wrong.",
      },
    ],
  },
  {
    id: "credentials",
    eyebrow: "Your credentials",
    title: "The platform knows when your license is expiring",
    blurb:
      "State instructor licenses lapse. Background checks expire. Continuing-ed hours need to be filed. directio tracks all of it, sends reminders, and auto-blocks scheduling the moment something lapses — so you find out before a parent does.",
    features: [
      {
        name: "License expiration tracking",
        body:
          "Reminders at 90 days, 60 days, 30 days, 7 days. Lapse = auto-block from being scheduled for new lessons. Surfaces on your school's owner dashboard so admins know to nudge before anything breaks.",
      },
      {
        name: "Background-check tracking",
        body:
          "Same auto-block pattern. The compliance card on your profile shows what's clean, what's expiring, what's expired.",
      },
      {
        name: "Continuing-ed hours",
        body:
          "School configures the annual requirement; your YTD hours are tracked. Soft warning, not a hard block — your school decides when CE shortfalls become an issue.",
      },
      {
        name: "Tax documents on file",
        body:
          "W-9 for 1099 instructors, W-4 + I-9 for W-2. Stored in audit-logged secure storage, never as a paper binder at the office. Year-end 1099-NEC PDFs auto-generated.",
      },
    ],
  },
  {
    id: "identity",
    eyebrow: "Cross-school identity",
    title: "Work at multiple schools? One login, one calendar.",
    blurb:
      "If you 1099 across two or three schools, directio knows. Your today view aggregates lessons from every school you teach at, badged so you see which is which. Pay rules carry forward separately for each school.",
    features: [
      {
        name: "Merged calendar",
        body:
          "Every lesson today, across every school you're an instructor at, in one ordered list. No need to log in to three separate systems.",
      },
      {
        name: "Per-school pay rules",
        body:
          "Each school configures its own compensation rules. Your earned-this-period number aggregates across all of them. Year-end you get one consolidated picture; per-school detail is right there if your accountant asks.",
      },
      {
        name: "Cross-tenant double-booking guard",
        body:
          "The scheduling engine respects your other schools' bookings when offering valid slots. Nobody at School A can book you for the same hour you're already teaching at School B.",
      },
    ],
  },
];

export default function ForInstructors({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative grain overflow-hidden">
        <MeshBackground />
        <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-16 sm:px-6 sm:pb-32 sm:pt-24">
          <Reveal>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              For instructors
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
              The school signs the contract.{" "}
              <span className="text-gradient">You decide whether it lives.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-3xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              Most driver-ed software is admin software with an instructor
              afterthought. directio is the other way: the instructor is the
              daily user. If the today view isn't faster than your group text
              and Google Sheet, we lost. Here's how we make sure we don't.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={dest}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
              >
                Sign in / get invited <span aria-hidden>→</span>
              </a>
              <Link
                to="/features#in-the-car-instructor-experience"
                className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-5 py-2.5 text-sm font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
              >
                Full feature index →
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Five clusters
            </p>
            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
              {CLUSTERS.map((c, i) => (
                <li key={c.id}>
                  <a
                    href={`#${c.id}`}
                    className="block rounded-xl border border-ink-200 px-3 py-2 text-sm text-ink-700 hover:border-brand-400 hover:bg-brand-50/30 dark:border-ink-800 dark:text-ink-200 dark:hover:border-brand-600 dark:hover:bg-brand-950/30"
                  >
                    <span className="font-mono text-xs text-ink-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>{" "}
                    {c.title}
                  </a>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {CLUSTERS.map((c) => (
        <ClusterBlock key={c.id} cluster={c} />
      ))}

      <section className="border-t border-ink-200/60 dark:border-ink-800/60">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <div className="rounded-3xl border border-ink-200 bg-gradient-to-br from-brand-50/40 to-accent-50/30 p-8 sm:p-12 dark:border-ink-800 dark:from-brand-950/30 dark:to-accent-900/20">
              <p className="text-xs uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">
                If your school uses directio
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
                Ask them to add your email as an instructor. The login auto-claims when you sign in.
              </h2>
              <p className="mt-3 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
                Once your email's on the instructor roster, directio will
                magic-link you in (no password to set, ever). Your today
                view lights up with the next day's schedule.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={dest}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_-4px_var(--color-brand-500)]"
                >
                  Sign in <span aria-hidden>→</span>
                </a>
                <Link
                  to="/for-schools"
                  className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/60 px-5 py-2.5 text-sm font-medium text-ink-700 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-200"
                >
                  For school owners →
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function ClusterBlock({ cluster }: { cluster: Cluster }) {
  return (
    <section
      id={cluster.id}
      className="border-t border-ink-200/60 dark:border-ink-800/60"
    >
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
            {cluster.eyebrow}
          </p>
          <h2 className="mt-2 max-w-3xl font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl dark:text-ink-50">
            {cluster.title}
          </h2>
          <p className="mt-4 max-w-3xl text-base text-ink-600 dark:text-ink-300">
            {cluster.blurb}
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {cluster.features.map((f, i) => (
            <Reveal key={f.name} delay={i * 80}>
              <div className="h-full rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40">
                <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                  {f.name}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                  {f.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
