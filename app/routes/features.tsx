import type { Route } from "./+types/features";
import { getSession } from "~/lib/session.server";
import { MarketingShell } from "~/components/marketing-shell";
import { MeshBackground, Reveal } from "~/components/motion";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Features · directio" },
    {
      name: "description",
      content:
        "Every feature in the directio platform — enrollment, classroom, scheduling, payments, compliance, family experience, operations, and discovery.",
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
    else if (role.role === "owner" || role.role === "admin") destination = "/admin";
    else if (role.role === "instructor") destination = "/instructor";
    else if (role.role === "parent") destination = "/family";
    else destination = "/me";
  }
  return {
    appEnv: env.APP_ENV ?? "unknown",
    signedIn: Boolean(session?.user),
    destination,
  };
}

type FeatureSection = {
  category: string;
  icon: string;
  blurb: string;
  features: { title: string; detail: string }[];
};

const SECTIONS: FeatureSection[] = [
  {
    category: "Enrollment & payments",
    icon: "◉",
    blurb:
      "From a public school listing to a paid enrollment, no portal-hopping. Stripe Connect handles the money so it never touches the directio account.",
    features: [
      {
        title: "Public school catalog",
        detail:
          "Branded marketing page at /schools/:slug. Programs and packages with transparent fee breakdowns. Anonymous browsing, gated checkout.",
      },
      {
        title: "Programs + packages",
        detail:
          "Programs (Teen, Adult, Refresher) bundle packages (Standard 6h BTW, Plus 10h, etc.) with per-package pricing, currency, and BTW lesson count.",
      },
      {
        title: "Transparent fee breakdown",
        detail:
          "Tuition, admin/compliance, credential processing, reschedule policy — all visible before the family agrees, all stored as line items.",
      },
      {
        title: "Stripe Connect Express",
        detail:
          "Schools own their connected account. Application fee handled at the directio platform level — Stripe never settles into a directio bank.",
      },
      {
        title: "One-time, BNPL, installments",
        detail:
          "Three checkout modes per package: one-time charge, Klarna/Affirm BNPL via Stripe, or recurring installment subscription. Schools pick the modes they offer.",
      },
      {
        title: "Refunds with application fee handling",
        detail:
          "Full and partial refunds with `refund_application_fee` so the school doesn't eat the platform cut on a drop-out.",
      },
    ],
  },
  {
    category: "Classroom (LMS)",
    icon: "📖",
    blurb:
      "A full LMS that schools install rather than build. Curriculum packs ship from the platform, schools deep-copy and edit a private version.",
    features: [
      {
        title: "Install-copy-edit curriculum",
        detail:
          "Platform-owned content_pack_version → deep-copied into school_module / school_lesson / school_quiz_question on install. Edits stay yours; platform updates surface as upgrade notices.",
      },
      {
        title: "Modules → lessons → quizzes",
        detail:
          "Hierarchical curriculum with ordinal sorting, drag-reorder, and published/draft state per asset.",
      },
      {
        title: "Lesson assets in R2",
        detail:
          "Per-lesson video, PDFs, and images. Streamed from R2 with tenant-scoped /assets/* gating so files never leak across schools.",
      },
      {
        title: "YouTube embed parser",
        detail:
          "Pastes any YouTube URL — watch?v=, youtu.be/, /embed/, /shorts/, /live/, m.youtube.com — and resolves to the canonical embed.",
      },
      {
        title: "Multiple-choice quizzes with rationales",
        detail:
          "Each question stores the right answer + a per-question rationale that surfaces after submission, not just the score.",
      },
      {
        title: "Quiz reports",
        detail:
          "Per-lesson pass rate, weakest-question table (min 3 attempts), struggling-students leaderboard, drill-in to per-question wrong-rate.",
      },
    ],
  },
  {
    category: "Scheduling",
    icon: "▦",
    blurb:
      "Behind-the-wheel is the hard part: instructor availability, vehicle assignment, no double-bookings, fee policies for late cancels and no-shows.",
    features: [
      {
        title: "Instructor availability windows",
        detail:
          "Instructors publish open windows on /instructor/availability. Admins see them as quick-pick chips when booking. Office-led scheduling by default; per-school self-scheduling toggle planned.",
      },
      {
        title: "Hard double-booking prevention",
        detail:
          "Bookings that overlap an existing scheduled/confirmed lesson on the same instructor — or the same vehicle — return 409 and never reach the database.",
      },
      {
        title: "Soft availability check + override",
        detail:
          "Booking outside an instructor's published window returns a 400 with an override option. Use case: the instructor agreed off-platform.",
      },
      {
        title: "Cron-driven reminders",
        detail:
          "Cloudflare Cron Trigger runs hourly. Sends 24-hour and 1-hour BTW reminders via Resend. Idempotent via UNIQUE constraint on cron_run; retries never double-send.",
      },
      {
        title: "Cancellation policy",
        detail:
          "Per-school: deadline (hours), late-cancel fee, no-show fee, family self-serve toggle. Cancellations inside the deadline assess the fee automatically.",
      },
      {
        title: "No-show flow",
        detail:
          "One-tap 'No-show' on the instructor today view. Fee assessed, journey state preserved, audit logged.",
      },
    ],
  },
  {
    category: "BTW lesson runner (instructor)",
    icon: "🚗",
    blurb:
      "The instructor experience is mobile-first: a today view that fits in one hand and never needs a desktop.",
    features: [
      {
        title: "Today view",
        detail:
          "Today's lessons sorted by time, with student name, kind (BTW / classroom / road test prep), vehicle, location, and one-tap phone/email links.",
      },
      {
        title: "Carry-over from last lesson",
        detail:
          "When the previous BTW for the same enrollment had a 'next focus' note, it shows as a Carry over banner — pre-flight context in 0 taps.",
      },
      {
        title: "Complete with status + notes",
        detail:
          "Completed / no-show / canceled (late) / weather-hold. Lesson notes visible to admin + family; next-focus pre-fills the chain.",
      },
      {
        title: "Practice-log sign-off",
        detail:
          "Parent-supervised drives queued for instructor sign-off. Signed entries count toward state-required supervised hours.",
      },
      {
        title: "Past / upcoming views",
        detail:
          "Quick filter to last 30 days and next 30 days; useful for instructors filling out timesheets.",
      },
    ],
  },
  {
    category: "Family experience",
    icon: "♡",
    blurb:
      "Parents and students see the same timeline. The parent portal handles waivers, practice logs, payment history, and self-serve cancellations.",
    features: [
      {
        title: "Multi-kid household view",
        detail:
          "One login surfaces every kid in the family. Both formal guardianStudent links and loose email-fallback claim work, so schools that haven't built out households yet still get value.",
      },
      {
        title: "Unified journey timeline",
        detail:
          "Enrolled → Classroom → Permit → BTW hours → Supervised practice → Road test → Certificate. Concrete numbers (4 / 6 BTW hours) and an animated 'now' indicator.",
      },
      {
        title: "Self-serve cancel + reschedule",
        detail:
          "Cancel an upcoming lesson without calling the office. Fee disclosed up front based on the school's policy; assessed automatically if inside the deadline.",
      },
      {
        title: "Document signing + uploads",
        detail:
          "Sign liability waivers and parental consents with a typed name + checkbox attestation. Upload paperwork (PDF / image) to R2.",
      },
      {
        title: "Parent practice log",
        detail:
          "Date, total minutes, night minutes, conditions, free-text notes. Instructor sign-off makes it state-compliant.",
      },
      {
        title: "Completion certificate",
        detail:
          "School-branded, serialized, printable. Admin issues, family downloads. Survives a copy-paste of the URL for the DMV.",
      },
    ],
  },
  {
    category: "Compliance",
    icon: "📜",
    blurb:
      "The hardest part of driver education is that the rules are different in every state. directio's rule engine is declarative, versioned, and per-tenant overridable.",
    features: [
      {
        title: "50 states + DC rule packs (seeded)",
        detail:
          "Every state's teen pathway shipped at MVP — Minnesota's Blue Card, Texas's parent-taught BTW eligibility, California's no-classroom-hours-required pathway, etc.",
      },
      {
        title: "Declarative + versioned",
        detail:
          "rule_pack + rule_pack_version + organization_rule_override. Definitions are JSON, not code, so updating a state requirement doesn't ship UI changes.",
      },
      {
        title: "Permit-eligibility credentials",
        detail:
          "Modeled generically — Blue Card, ITTD, driver-education certificate. Delivery modes: manual hand-off, PDF export, or DMV API integration.",
      },
      {
        title: "Three-level state adapter maturity",
        detail:
          "Level 1: manual checklist. Level 2: PDF export. Level 3: DMV API. Honest national coverage; deep Minnesota implementation first.",
      },
      {
        title: "Road test outcome tracking",
        detail:
          "Per-attempt logging with examiner notes and testing center. Auto-advances journey state on first pass. Surfaces pass-rate + first-try-pass metric to the school.",
      },
      {
        title: "Audit log",
        detail:
          "Credential issuance, rule overrides, fee changes, cancellations, document approvals, certificate issuance — every compliance-relevant action recorded with actor, timestamp, and JSON payload.",
      },
    ],
  },
  {
    category: "Operations",
    icon: "⚙",
    blurb:
      "The back-office tooling schools actually use day-to-day. Imports, document review, fee collection, public listing, theming.",
    features: [
      {
        title: "AI-assisted CSV import",
        detail:
          "Drop in a legacy CSV from a previous tool. Claude normalizes the rows, flags conflicts, and bulk-creates students + guardians.",
      },
      {
        title: "Document review queue",
        detail:
          "/admin/documents shows pending waivers, parental consents, and uploaded paperwork. Approve, reject (with reason in audit log), or reopen.",
      },
      {
        title: "Fee collection workflow",
        detail:
          "/admin/fees lists assessed cancellation + no-show fees. Headline tiles for pending / paid / waived. Mark paid or waive in one click.",
      },
      {
        title: "Public listing",
        detail:
          "Opt-in branded page at /schools/:slug with tagline, about copy, programs, and a checkout CTA. School controls visibility.",
      },
      {
        title: "Per-tenant theming",
        detail:
          "Logo, brand color, and custom fonts via CSS custom properties on <html>. Every school looks like their own product.",
      },
      {
        title: "Onboarding wizard",
        detail:
          "Add an instructor, add a vehicle, install a rule pack, install a curriculum pack — checked off as the school finishes each step.",
      },
    ],
  },
  {
    category: "Discovery & help",
    icon: "?",
    blurb:
      "When the family gets to a state-managed step — finding a testing center, booking a road test, locating a partner school — directio surfaces it inside the app.",
    features: [
      {
        title: "BTW lesson finder",
        detail:
          "Mapbox-powered. Parents enter their ZIP, see the school's BTW step flow plus nearby state-testing centers, driving schools, and DMV offices.",
      },
      {
        title: "Place enrichment",
        detail:
          "When the directory is sparse, an admin can trigger Perplexity to surface verified candidates in the org's jurisdiction; ingested with provenance.",
      },
      {
        title: "Configurable BTW flow",
        detail:
          "Each school defines its own step list at /admin/settings/btw-flow: plain instructions, find-a-place steps, external links, document uploads, payments.",
      },
      {
        title: "AI help center",
        detail:
          "Grounded answers from your school's help articles + the platform library. Asks follow-up questions when the answer requires a fee + schedule combination.",
      },
      {
        title: "Voice playback",
        detail:
          "Optional ElevenLabs synthesis for accessibility — long answers can be heard, not just read.",
      },
    ],
  },
];

export default function Features({ loaderData }: Route.ComponentProps) {
  const dest = loaderData.destination ?? "/signup";
  return (
    <MarketingShell
      signedIn={loaderData.signedIn}
      destination={dest}
      appEnv={loaderData.appEnv}
    >
      <section className="relative grain overflow-hidden">
        <MeshBackground />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-24">
          <Reveal>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
              Features
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight text-ink-900 sm:text-5xl md:text-6xl dark:text-ink-50">
              Everything in the box.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-base text-ink-600 sm:text-lg dark:text-ink-300">
              No "coming soon", no premium upsell tier. If a feature is listed here, it's in the
              shipped codebase, has a backing migration, and has a smoke test that exercises it.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <nav className="mb-12 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.category}
              href={`#${slugify(s.category)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/60 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:border-brand-300 hover:text-ink-900 dark:border-ink-800 dark:bg-ink-900/40 dark:text-ink-300 dark:hover:border-brand-700 dark:hover:text-ink-50"
            >
              <span className="text-sm" aria-hidden>
                {s.icon}
              </span>
              {s.category}
            </a>
          ))}
        </nav>

        <div className="flex flex-col gap-16 sm:gap-24">
          {SECTIONS.map((s, i) => (
            <Reveal key={s.category} delay={(i % 2) * 60}>
              <section id={slugify(s.category)} className="scroll-mt-24">
                <div className="grid gap-8 lg:grid-cols-[1fr_2fr] lg:gap-16">
                  <div>
                    <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/15 to-accent-500/15 text-2xl">
                      {s.icon}
                    </div>
                    <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl dark:text-ink-50">
                      {s.category}
                    </h2>
                    <p className="mt-3 text-base text-ink-600 sm:text-lg dark:text-ink-300">
                      {s.blurb}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-3">
                    {s.features.map((f) => (
                      <li
                        key={f.title}
                        className="rounded-2xl border border-ink-200 bg-white/70 p-5 backdrop-blur-sm transition hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-700"
                      >
                        <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">
                          {f.title}
                        </h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                          {f.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </Reveal>
          ))}
        </div>

        <div className="mt-20 flex justify-center">
          <a
            href={dest}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-3 text-base font-medium text-white shadow-[0_8px_28px_-6px_var(--color-brand-500)] transition-all hover:shadow-[0_16px_44px_-8px_var(--color-brand-500)]"
          >
            {loaderData.signedIn ? "Continue" : "Start your school"} <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </MarketingShell>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
