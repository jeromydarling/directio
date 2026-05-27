/**
 * AI-generated school marketing website.
 *
 *  - Takes the intake answers a school owner fills in
 *  - Runs them through Workers AI (Llama 3.3 70b via the gateway)
 *  - Produces a structured JSON object with every section's copy
 *  - Public /schools/:slug renders from this structure
 *
 * The model is told the structure to produce, so we get consistent shape
 * we can render even before the school edits a word.
 */

import { extractJson, workersAiPrompt } from "./llm.server";

export type WebsiteIntake = {
  schoolName: string;
  city: string;
  region?: string; // state or region
  vibeWords?: string; // three adjectives
  whatMakesUsDifferent?: string;
  yearsExperience?: string;
  programsOffered?: string;
  instructorBackground?: string;
  hours?: string;
  phone?: string;
  email?: string;
  faqAnchors?: string; // common parent questions to address
};

export type WebsiteSection = {
  title: string;
  body: string;
};

export type WebsiteSections = {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  story: {
    title: string;
    body: string;
  };
  whyUs: {
    title: string;
    points: { title: string; body: string }[];
  };
  services: {
    title: string;
    body: string;
  };
  instructors: {
    title: string;
    body: string;
  };
  testimonials: {
    title: string;
    items: { quote: string; by: string }[];
  };
  faq: {
    title: string;
    items: { q: string; a: string }[];
  };
  cta: {
    title: string;
    body: string;
  };
  meta: {
    title: string;
    description: string;
    keywords: string[];
    ogTagline: string;
  };
};

const SYSTEM_PROMPT = `You are a copywriter who specializes in small driving school
marketing sites. Your tone is: warm, direct, parent-friendly, never
salesy. You favor specifics over fluff. Real numbers when given,
honest claims, never invented credentials.

You always:
- Respect the school's voice and the answers they gave you
- Write in second person, addressing the parent/family reader
- Avoid superlatives ("the best", "world-class") — they sound fake
- Include the school's city/region by name several times for SEO
- Keep copy tight; readers skim

You never:
- Invent statistics, awards, or instructor credentials
- Promise outcomes ("guaranteed first-try pass")
- Use sleazy urgency ("act now!")
- Output anything except the JSON object I ask for`;

function userPrompt(intake: WebsiteIntake): string {
  return `Produce the JSON website for this driving school.

## School answers
- Name: ${intake.schoolName}
- Location: ${intake.city}${intake.region ? `, ${intake.region}` : ""}
- Vibe (three words): ${intake.vibeWords ?? "warm, professional, local"}
- What makes us different: ${intake.whatMakesUsDifferent ?? "(not provided)"}
- Years in business: ${intake.yearsExperience ?? "(new)"}
- Programs offered: ${intake.programsOffered ?? "teen driver education, behind-the-wheel"}
- Instructor background: ${intake.instructorBackground ?? "state-certified driving instructors"}
- Hours: ${intake.hours ?? "by appointment"}
- Phone: ${intake.phone ?? "(none provided)"}
- Email: ${intake.email ?? "(none provided)"}
- Common parent questions to address: ${intake.faqAnchors ?? "scheduling, pricing, what to expect"}

## Output

Produce ONE JSON object with this exact shape. Write all copy in
American English. Mention "${intake.city}" by name in the hero and
at least twice elsewhere for local SEO.

\`\`\`json
{
  "hero": {
    "eyebrow": "3-5 word category line, e.g. 'Driver education in {city}'",
    "title": "8-12 word headline that makes a clear promise",
    "subtitle": "1-2 sentence pitch addressing a parent reader",
    "ctaPrimary": "Get started",
    "ctaSecondary": "View programs"
  },
  "story": {
    "title": "Short section heading about the school",
    "body": "2-3 paragraph 'about us' that incorporates the years experience and the 'what makes us different' answer. Honest. No superlatives."
  },
  "whyUs": {
    "title": "Why families choose ${intake.schoolName}",
    "points": [
      {"title": "5-word benefit", "body": "1-2 sentence elaboration"},
      {"title": "5-word benefit", "body": "1-2 sentence elaboration"},
      {"title": "5-word benefit", "body": "1-2 sentence elaboration"}
    ]
  },
  "services": {
    "title": "What we teach",
    "body": "1-2 paragraphs about programs. Mention specific package names from the answer above."
  },
  "instructors": {
    "title": "Who teaches your kid",
    "body": "1 paragraph about instructor qualifications + 'background' answer above. Specific where possible, vague where not."
  },
  "testimonials": {
    "title": "What ${intake.city} families say",
    "items": [
      {"quote": "Believable parent quote, 1-2 sentences. NEVER invent a specific name; use first name + initial.", "by": "First name + L., ${intake.city}"},
      {"quote": "...", "by": "First name + L., ${intake.city}"}
    ]
  },
  "faq": {
    "title": "Frequently asked questions",
    "items": [
      {"q": "Real question parents ask", "a": "1-2 sentence honest answer"},
      {"q": "...", "a": "..."},
      {"q": "...", "a": "..."},
      {"q": "...", "a": "..."}
    ]
  },
  "cta": {
    "title": "10-word closing line that gets the click",
    "body": "1 sentence pitch + a soft promise. End with a clear next step."
  },
  "meta": {
    "title": "SEO page title under 60 chars including '${intake.schoolName}' and 'driver education'",
    "description": "SEO meta description under 160 chars; include city + what we do",
    "keywords": ["6-10", "search", "phrases", "a parent in ${intake.city}", "might google"],
    "ogTagline": "10-word social-share tagline"
  }
}
\`\`\`

Output ONLY the JSON object, no preamble.`;
}

export type GeneratedWebsite = {
  sections: WebsiteSections;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
};

export async function generateWebsite(
  env: Env,
  intake: WebsiteIntake,
): Promise<GeneratedWebsite> {
  const res = await workersAiPrompt(env, {
    system: SYSTEM_PROMPT,
    prompt: userPrompt(intake),
    model: "smart",
    maxTokens: 4096,
    temperature: 0.4,
  });
  let sections = extractJson<WebsiteSections>(res.text);
  if (!sections) {
    const retry = await workersAiPrompt(env, {
      system: SYSTEM_PROMPT,
      prompt:
        userPrompt(intake) +
        "\n\nIMPORTANT: Output the JSON object directly. No preamble, no markdown fences. Start with { and end with }.",
      model: "smart",
      maxTokens: 4096,
      temperature: 0.2,
    });
    sections = extractJson<WebsiteSections>(retry.text);
    if (!sections)
      throw new Error(
        `Website generator: model returned non-JSON (${res.text.slice(0, 200)})`,
      );
  }
  return {
    sections,
    modelUsed: res.modelUsed,
    inputTokens: res.inputTokens ?? 0,
    outputTokens: res.outputTokens ?? 0,
  };
}

/**
 * Sensible default sections used if no AI generation has run yet.
 * Falls back to data straight from the organization row.
 */
export function defaultSections(org: {
  name: string;
  publicTagline?: string | null;
  publicAbout?: string | null;
  jurisdiction?: string | null;
}): WebsiteSections {
  const cityHint =
    (org.jurisdiction ?? "").replace("US-", "") || "your area";
  return {
    hero: {
      eyebrow: `Driver education in ${cityHint}`,
      title: org.publicTagline ?? `${org.name} — teach your teen to drive`,
      subtitle:
        org.publicAbout?.slice(0, 240) ??
        "Behind-the-wheel lessons, classroom hours, and the state credential — all in one place.",
      ctaPrimary: "Get started",
      ctaSecondary: "View programs",
    },
    story: {
      title: `About ${org.name}`,
      body:
        org.publicAbout ??
        `We help teen drivers in ${cityHint} go from classroom to a real driver's license, with no surprise fees and a real human you can call.`,
    },
    whyUs: {
      title: `Why families choose ${org.name}`,
      points: [
        {
          title: "One login per family",
          body: "All your kids, every payment, every signed waiver — one page on your phone.",
        },
        {
          title: "Every fee, before it's owed",
          body: "Tuition, admin fees, credential processing — visible upfront, never a surprise.",
        },
        {
          title: "Cancel without phone tag",
          body: "Reschedule from the bus stop. Our fee policy is visible before you commit.",
        },
      ],
    },
    services: {
      title: "What we teach",
      body: "We offer state-certified classroom instruction and behind-the-wheel lessons. Specific package details and pricing are listed below — every fee is on the page before you sign up.",
    },
    instructors: {
      title: "Who teaches your kid",
      body: "Our instructors are state-certified and insured. We treat your kid like we'd want our own kid treated — patient, no shortcuts, every safety check.",
    },
    testimonials: {
      title: `What ${cityHint} families say`,
      items: [
        {
          quote:
            "They actually answered the phone. After three other schools wouldn't, that's all it took.",
          by: `Jamie L., ${cityHint}`,
        },
        {
          quote:
            "I appreciated being able to see the full timeline — exactly where my kid was in the process, every step.",
          by: `Pat M., ${cityHint}`,
        },
      ],
    },
    faq: {
      title: "Frequently asked questions",
      items: [
        {
          q: "How do I know when my kid is permit-eligible?",
          a: "It shows up on your family timeline the moment they hit your state's classroom hour requirement. We'll walk you through getting the permit.",
        },
        {
          q: "What's your cancellation policy?",
          a: "Cancel free up to our deadline. Late cancellations and no-shows have a flat fee that's visible at checkout — never a surprise charge.",
        },
        {
          q: "Can both parents log in?",
          a: "Yes. Multiple guardians per student is standard. Each parent sees the same household.",
        },
      ],
    },
    cta: {
      title: "Ready to get started?",
      body: "Pick a program below and sign up online. Your first lesson can be on the books within a week.",
    },
    meta: {
      title: `${org.name} — driver education in ${cityHint}`,
      description:
        org.publicTagline ??
        `Classroom and behind-the-wheel driver education in ${cityHint}. Transparent pricing, modern family portal, every fee visible upfront.`,
      keywords: [
        `driving school ${cityHint}`,
        `driver education ${cityHint}`,
        "teen drivers ed",
        "behind the wheel lessons",
        "permit credential",
      ],
      ogTagline: `Driver education done right in ${cityHint}.`,
    },
  };
}
