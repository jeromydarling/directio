/**
 * In-app product tour scripts — coach-marks over the real UI.
 *
 * Each tour is a list of steps. A step either spotlights a DOM element
 * (`target` is a CSS selector; the engine picks the first VISIBLE
 * match and silently skips steps whose target isn't on screen — empty
 * states, mobile-hidden sidebars) or, with no target, renders as a
 * centered card for narrative beats.
 *
 * Selector policy: prefer `a[href='...']` for nav/CTA anchors (hrefs
 * are the most stable thing in the app) and `[data-tour='...']` when
 * an element needs an explicit hook. Never target Tailwind classes.
 */

export type TourStep = {
  /** CSS selector; omit for a centered narrative card. */
  target?: string;
  title: string;
  body: string;
};

export type TourDef = {
  id: string;
  /** Shown on the launcher button's tooltip/aria-label. */
  label: string;
  steps: TourStep[];
};

export const TOURS: Record<string, TourDef> = {
  "admin-dashboard": {
    id: "admin-dashboard",
    label: "Tour the admin console",
    steps: [
      {
        title: "Welcome to your school's control room",
        body: "This dashboard answers “is the business healthy?” at a glance. Everything below it — students, money, lessons — updates live. Let's walk the map once; after that, every section has its own tour button like the one you just clicked.",
      },
      {
        target: "a[href='/admin/students']",
        title: "Students",
        body: "Every student, their enrollment, and their journey timeline — enrolled → classroom → permit → behind-the-wheel → licensed. Add them one at a time or import your whole roster from a spreadsheet.",
      },
      {
        target: "a[href='/admin/schedule']",
        title: "Schedule",
        body: "All upcoming lessons. Book single lessons or recurring series, drag things around on the board, and let the system refuse double-booked instructors and cars for you.",
      },
      {
        target: "a[href='/admin/programs']",
        title: "Programs",
        body: "What you sell: Teen, Adult Refresher, Road Test Prep — each with pricing packages. Families see these on your public page and enroll without calling the office.",
      },
      {
        target: "a[href='/admin/payments']",
        title: "Payments",
        body: "Every dollar families pay, mirrored from Stripe, with in-line refund control. Money goes straight to your bank — directio never holds it.",
      },
      {
        target: "a[href='/admin/library']",
        title: "Curriculum",
        body: "Install the starter classroom curriculum, then edit your copy freely — lessons, quizzes, audio narration, even translations. Platform updates never overwrite your edits.",
      },
      {
        target: "a[href='/admin/website']",
        title: "Website",
        body: "Your public marketing site, AI-generated from a 10-question intake. Studio tier lets you point your own domain at it.",
      },
      {
        target: "a[href='/admin/settings']",
        title: "Settings",
        body: "State rule packs, cancellation policy, payment setup, email digests, and your plan. When something about your school needs to change, it changes here.",
      },
      {
        title: "That's the map",
        body: "One more thing: the ✦ Tour button in each section's header replays that section's guide anytime. You can't break anything by exploring — every important action asks before it commits.",
      },
    ],
  },

  "admin-students": {
    id: "admin-students",
    label: "How students work",
    steps: [
      {
        title: "Students are the spine of everything",
        body: "A student row ties together enrollment, payments, lessons, documents, and the state-compliance journey. Everything else in the app hangs off the people on this page.",
      },
      {
        target: "a[href='/admin/students/new']",
        title: "Add a student",
        body: "Adding a student with an email invites them: when they sign in with that address (magic link), their account links to this record automatically — classroom, schedule, and timeline included.",
      },
      {
        target: "a[href='/admin/import']",
        title: "Or import your whole roster",
        body: "Migrating from spreadsheets? Paste or upload your list — even messy, unstructured ones — and AI normalizes it into student records you review before committing.",
      },
      {
        title: "Click any student to run their world",
        body: "The student detail page is where you advance their journey (classroom done, permit issued, road test passed), see their payments, and manage their enrollment. Every compliance action lands in the audit log automatically.",
      },
    ],
  },

  "admin-schedule": {
    id: "admin-schedule",
    label: "How scheduling works",
    steps: [
      {
        title: "Scheduling that argues back",
        body: "Every lesson needs an instructor, and optionally a car. The system flat-out refuses double-bookings and warns when you book outside an instructor's published availability.",
      },
      {
        target: "a[href='/admin/schedule/new']",
        title: "Book one lesson",
        body: "Pick student, instructor, vehicle, time. Families get automatic email reminders 24 hours and 1 hour before.",
      },
      {
        target: "a[href='/admin/schedule/series/new']",
        title: "Or book a series",
        body: "Weekly lesson blocks in one shot — the whole series lands on the calendar and each conflict is caught individually.",
      },
      {
        target: "a[href='/admin/schedule/board']",
        title: "The live board",
        body: "A drag-and-drop view of the week that updates in real time for everyone looking at it. Great with two office screens open.",
      },
      {
        title: "Cancellations respect YOUR policy",
        body: "Families can self-cancel until your deadline (set in Settings → Cancellation). Late cancels and no-shows queue the fee you configured — collected on your terms, never auto-charged.",
      },
    ],
  },

  "admin-programs": {
    id: "admin-programs",
    label: "How programs & pricing work",
    steps: [
      {
        title: "Programs are what families buy",
        body: "A program (Teen, Adult Refresher…) holds one or more packages — the sellable units with a price and a number of behind-the-wheel lessons. These render on your public page with every fee visible up front.",
      },
      {
        target: "a[href='/admin/programs/new']",
        title: "Create a program",
        body: "Name it, pick the kind, then add packages inside it. A package can allow monthly installments and buy-now-pay-later — Stripe handles both.",
      },
      {
        title: "Transparent pricing is the product",
        body: "Families see tuition, your late-cancel fee, and your no-show fee before they enroll. No surprise fees is a directio-wide promise — it's why families trust schools on the platform.",
      },
    ],
  },

  "admin-payments": {
    id: "admin-payments",
    label: "How payments work",
    steps: [
      {
        title: "The money page",
        body: "Every family payment flows card → Stripe → your bank, with directio's small platform fee carved out automatically. This page mirrors Stripe so you rarely need to open it.",
      },
      {
        title: "Refunds happen here",
        body: "Refund any succeeded payment in-line. The money returns to the family, the transferred funds come back from your balance, and directio's fee is returned proportionally. Disputes and payout failures surface here too, via the audit log.",
      },
      {
        target: "a[href='/admin/settings/payments']",
        title: "Stripe connection lives in Settings",
        body: "Bank onboarding, payout status, and requirements — if charges ever pause, this is where Stripe tells you why.",
      },
    ],
  },

  "admin-settings": {
    id: "admin-settings",
    label: "Tour of settings",
    steps: [
      {
        title: "The switchboard",
        body: "Four things live here: your state's rule pack, your money setup, your policies, and your notifications. Most schools set these once and never come back.",
      },
      {
        target: "a[href='/admin/settings/payments']",
        title: "Payments setup",
        body: "Connect your bank via Stripe. Until this is done, families can't check out online — it's the single most important setup step.",
      },
      {
        target: "a[href='/admin/settings/cancellation']",
        title: "Cancellation policy",
        body: "Your deadline, your late-cancel fee, your no-show fee, and whether families may self-cancel. Shown to families before they enroll.",
      },
      {
        title: "Digests keep you out of the app",
        body: "The daily digest emails your top-line numbers each morning; the Monday digest shows what directio handled for you last week. Both configurable on this page.",
      },
    ],
  },

  "admin-website": {
    id: "admin-website",
    label: "How the website builder works",
    steps: [
      {
        title: "A real marketing site, not a page builder",
        body: "Answer the intake honestly — vibe words, what makes you different, your hours — and the AI writes and lays out a full site. Your programs, pricing, and instructors sync onto it automatically whenever they change.",
      },
      {
        title: "Publish, then (optionally) bring your domain",
        body: "Publishing puts you at godirectio.com/schools/your-slug immediately. Studio tier adds your own domain (yourschool.com) with automatic HTTPS — families never know directio is underneath.",
      },
      {
        title: "Regenerate without fear",
        body: "Don't like the copy? Adjust the intake and regenerate — or switch templates. Nothing touches your students, schedule, or money; this section is pure storefront.",
      },
    ],
  },

  "admin-library": {
    id: "admin-library",
    label: "How curriculum works",
    steps: [
      {
        title: "Install, then make it yours",
        body: "Installing a content pack gives your school its own COPY — modules, lessons, quizzes. Edit anything; the master stays untouched, and platform updates arrive as a “review and accept” notice, never a forced overwrite.",
      },
      {
        title: "Lessons can talk",
        body: "Each lesson can have AI audio narration (or record your own voice), and you can require students to listen to 85% before the quiz unlocks — server-tracked, no speed-running.",
      },
      {
        title: "Teach in any language",
        body: "Translate lessons per-language from the Translations section. Students pick their language in the lesson player; quizzes stay aligned with the English source of truth.",
      },
    ],
  },

  "instructor-today": {
    id: "instructor-today",
    label: "Tour the instructor view",
    steps: [
      {
        title: "Built for one hand on a phone",
        body: "This is today's runsheet: your lessons in order, with student notes from last time. Everything important is two taps or fewer, and it works on a weak signal.",
      },
      {
        target: "a[href='/instructor/availability']",
        title: "Publish your hours",
        body: "The office can only book you inside the availability you publish here. Change it anytime; existing lessons stay put.",
      },
      {
        target: "a[href='/instructor/practice-log']",
        title: "Sign off practice hours",
        body: "Parents log supervised practice drives; you review and sign off here. Signed hours count toward the state requirement on the student's timeline.",
      },
      {
        title: "After each lesson",
        body: "Complete, no-show, weather-hold — one form. Add a note for next time and it greets you at the top of that student's next lesson.",
      },
    ],
  },

  "family-home": {
    id: "family-home",
    label: "Tour the family portal",
    steps: [
      {
        title: "One login, the whole journey",
        body: "Every kid, one page: where they are on the road to a license, what happens next, and what it costs. No surprise fees — anything you could ever owe is listed before it happens.",
      },
      {
        target: "a[href='/family/lessons']",
        title: "Lessons",
        body: "Upcoming lessons with self-serve cancellation (your school's deadline and any late fee are shown before you confirm). Email reminders come automatically.",
      },
      {
        target: "a[href='/family/practice-log']",
        title: "Practice log",
        body: "Log supervised practice drives from your phone in the driveway. The instructor signs off, and the hours count toward the state requirement.",
      },
      {
        target: "a[href='/family/documents']",
        title: "Documents",
        body: "Sign waivers, upload paperwork, and download the completion certificate when it's earned — no printer required.",
      },
      {
        target: "a[href='/family/payments']",
        title: "Payments",
        body: "Your full payment history with the school. Paying by installments? Each month's charge appears here as it lands.",
      },
    ],
  },
};
