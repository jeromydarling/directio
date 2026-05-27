import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.website";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { recordAudit } from "~/lib/audit.server";
import {
  generateWebsite,
  type WebsiteIntake,
  type WebsiteSections,
} from "~/lib/website-generator.server";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

const THEMES = [
  {
    key: "brand",
    name: "Brand",
    blurb: "Modern, polished, brand-color forward. Default for most schools.",
  },
  {
    key: "trade",
    name: "Trade",
    blurb: "Workmanlike, no-nonsense. Big type, classic layout, trustworthy.",
  },
  {
    key: "editorial",
    name: "Editorial",
    blurb: "Magazine-style. Long-form story, generous whitespace.",
  },
  {
    key: "bold",
    name: "Bold",
    blurb: "High-contrast dark mode with gradient accents. Stands out.",
  },
] as const;

type WebsiteRow = {
  id: string;
  organizationId: string;
  intakeJson: string | null;
  intakeUpdatedAt: number | null;
  sectionsJson: string | null;
  sectionsModel: string | null;
  sectionsGeneratedAt: number | null;
  theme: string;
  customDomain: string | null;
  customDomainVerifiedAt: number | null;
  customDomainVerifyToken: string | null;
  tier: string;
  createdAt: number;
  updatedAt: number;
};

type OrgRow = {
  id: string;
  name: string;
  publicSlug: string | null;
  publicTagline: string | null;
  publicAbout: string | null;
  publicPublishedAt: number | null;
  jurisdiction: string | null;
  brandColor: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");

  const org = await context.cloudflare.env.DB.prepare(
    `SELECT id, name, publicSlug, publicTagline, publicAbout, publicPublishedAt,
            jurisdiction, brandColor
       FROM organization WHERE id = ?`,
  )
    .bind(tenant.organization.id)
    .first<OrgRow>();
  if (!org) throw new Response("Not found", { status: 404 });

  const website = await context.cloudflare.env.DB.prepare(
    `SELECT id, organizationId, intakeJson, intakeUpdatedAt, sectionsJson,
            sectionsModel, sectionsGeneratedAt, theme, customDomain,
            customDomainVerifiedAt, customDomainVerifyToken, tier, createdAt, updatedAt
       FROM school_website WHERE organizationId = ?`,
  )
    .bind(tenant.organization.id)
    .first<WebsiteRow>();

  return { org, website };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const orgId = tenant.organization.id;
  const now = Date.now();

  if (intent === "save-intake-generate") {
    const intake: WebsiteIntake = {
      schoolName: String(formData.get("schoolName") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      region: String(formData.get("region") ?? "").trim() || undefined,
      vibeWords: String(formData.get("vibeWords") ?? "").trim() || undefined,
      whatMakesUsDifferent:
        String(formData.get("whatMakesUsDifferent") ?? "").trim() || undefined,
      yearsExperience: String(formData.get("yearsExperience") ?? "").trim() || undefined,
      programsOffered: String(formData.get("programsOffered") ?? "").trim() || undefined,
      instructorBackground:
        String(formData.get("instructorBackground") ?? "").trim() || undefined,
      hours: String(formData.get("hours") ?? "").trim() || undefined,
      phone: String(formData.get("phone") ?? "").trim() || undefined,
      email: String(formData.get("email") ?? "").trim() || undefined,
      faqAnchors: String(formData.get("faqAnchors") ?? "").trim() || undefined,
    };
    if (!intake.schoolName || !intake.city)
      return data(
        { error: "School name and city are required." },
        { status: 400 },
      );

    let generated: { sections: WebsiteSections; modelUsed: string; inputTokens: number; outputTokens: number };
    try {
      generated = await generateWebsite(env, intake);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "AI generation failed";
      return data({ error: msg }, { status: 500 });
    }

    // Upsert school_website + write a version row
    const existing = await env.DB.prepare(
      "SELECT id FROM school_website WHERE organizationId = ?",
    )
      .bind(orgId)
      .first<{ id: string }>();
    const websiteId = existing?.id ?? newId();
    const versionId = newId();
    const intakeJson = JSON.stringify(intake);
    const sectionsJson = JSON.stringify(generated.sections);

    if (existing) {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE school_website
              SET intakeJson = ?, intakeUpdatedAt = ?, sectionsJson = ?,
                  sectionsModel = ?, sectionsGeneratedAt = ?, updatedAt = ?
            WHERE id = ?`,
        ).bind(intakeJson, now, sectionsJson, generated.modelUsed, now, now, websiteId),
        env.DB.prepare(
          `INSERT INTO school_website_version
             (id, websiteId, intakeJson, sectionsJson, model, tokensIn, tokensOut,
              createdAt, createdByUserId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          versionId,
          websiteId,
          intakeJson,
          sectionsJson,
          generated.modelUsed,
          generated.inputTokens,
          generated.outputTokens,
          now,
          tenant.user.id,
        ),
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO school_website
             (id, organizationId, intakeJson, intakeUpdatedAt, sectionsJson,
              sectionsModel, sectionsGeneratedAt, theme, tier, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'brand', 'free', ?, ?)`,
        ).bind(websiteId, orgId, intakeJson, now, sectionsJson, generated.modelUsed, now, now, now),
        env.DB.prepare(
          `INSERT INTO school_website_version
             (id, websiteId, intakeJson, sectionsJson, model, tokensIn, tokensOut,
              createdAt, createdByUserId)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          versionId,
          websiteId,
          intakeJson,
          sectionsJson,
          generated.modelUsed,
          generated.inputTokens,
          generated.outputTokens,
          now,
          tenant.user.id,
        ),
      ]);
    }

    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: existing ? "website.regenerated" : "website.generated",
      entityType: "school_website",
      entityId: websiteId,
      payload: { model: generated.modelUsed, tokensIn: generated.inputTokens, tokensOut: generated.outputTokens },
    });

    return redirect("/admin/website");
  }

  if (intent === "set-theme") {
    const theme = String(formData.get("theme") ?? "brand");
    if (!THEMES.find((t) => t.key === theme))
      return data({ error: "Unknown theme." }, { status: 400 });
    await env.DB.prepare(
      "UPDATE school_website SET theme = ?, updatedAt = ? WHERE organizationId = ?",
    )
      .bind(theme, now, orgId)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "website.theme_changed",
      entityType: "school_website",
      entityId: null,
      payload: { theme },
    });
    return redirect("/admin/website");
  }

  if (intent === "set-custom-domain") {
    const domain = String(formData.get("customDomain") ?? "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!domain) {
      // Clear it
      await env.DB.prepare(
        `UPDATE school_website
            SET customDomain = NULL, customDomainVerifiedAt = NULL,
                customDomainVerifyToken = NULL, updatedAt = ?
          WHERE organizationId = ?`,
      )
        .bind(now, orgId)
        .run();
      return redirect("/admin/website");
    }
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain))
      return data(
        { error: "Looks like an invalid domain. Try yourschool.com (no http://, no slash)." },
        { status: 400 },
      );

    const token = "directio-verify-" + newId().slice(0, 16).toLowerCase();
    await env.DB.prepare(
      `UPDATE school_website
          SET customDomain = ?, customDomainVerifyToken = ?,
              customDomainVerifiedAt = NULL, updatedAt = ?
        WHERE organizationId = ?`,
    )
      .bind(domain, token, now, orgId)
      .run();
    await recordAudit(env, {
      organizationId: orgId,
      actorUserId: tenant.user.id,
      action: "website.custom_domain_set",
      entityType: "school_website",
      entityId: null,
      payload: { domain },
    });
    return redirect("/admin/website");
  }

  if (intent === "verify-custom-domain") {
    const row = await env.DB.prepare(
      "SELECT customDomain, customDomainVerifyToken FROM school_website WHERE organizationId = ?",
    )
      .bind(orgId)
      .first<{ customDomain: string | null; customDomainVerifyToken: string | null }>();
    if (!row?.customDomain || !row.customDomainVerifyToken)
      return data({ error: "Set a domain first." }, { status: 400 });

    // Use Cloudflare DoH to check for the TXT verify record
    try {
      const dohUrl = `https://cloudflare-dns.com/dns-query?name=_directio-verify.${encodeURIComponent(row.customDomain)}&type=TXT`;
      const dohRes = await fetch(dohUrl, {
        headers: { Accept: "application/dns-json" },
      });
      const dohJson = (await dohRes.json()) as { Answer?: Array<{ data?: string }> };
      const txts = (dohJson.Answer ?? [])
        .map((a) => (a.data ?? "").replace(/^"|"$/g, ""))
        .join(" ");
      const verified = txts.includes(row.customDomainVerifyToken);
      if (verified) {
        await env.DB.prepare(
          `UPDATE school_website SET customDomainVerifiedAt = ?, updatedAt = ?
              WHERE organizationId = ?`,
        )
          .bind(now, now, orgId)
          .run();
        await recordAudit(env, {
          organizationId: orgId,
          actorUserId: tenant.user.id,
          action: "website.custom_domain_verified",
          entityType: "school_website",
          entityId: null,
          payload: { domain: row.customDomain },
        });
        return redirect("/admin/website");
      } else {
        return data(
          {
            error:
              "Couldn't find the TXT verify record yet. DNS can take a few minutes to propagate — try again in a few.",
          },
          { status: 400 },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "DNS lookup failed";
      return data({ error: msg }, { status: 500 });
    }
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function AdminWebsite({ loaderData, actionData }: Route.ComponentProps) {
  const { org, website } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  let intake: Partial<WebsiteIntake> = {};
  try {
    intake = website?.intakeJson ? JSON.parse(website.intakeJson) : {};
  } catch {
    intake = {};
  }
  let sections: WebsiteSections | null = null;
  try {
    sections = website?.sectionsJson ? JSON.parse(website.sectionsJson) : null;
  } catch {
    sections = null;
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Studio · your marketing website"
        title="Your AI-built website"
        description="Answer the intake below and we generate a full marketing site for your school. Edit, regenerate, or point your own domain at it."
        actions={
          org.publicSlug ? (
            <LinkButton to={`/schools/${org.publicSlug}`} variant="secondary" external>
              View live site →
            </LinkButton>
          ) : undefined
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      {sections && website?.sectionsGeneratedAt && (
        <Card className="border-emerald-300 bg-emerald-50/30 dark:border-emerald-800/60 dark:bg-emerald-950/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                Generated {new Date(website.sectionsGeneratedAt).toLocaleString()}
              </p>
              <p className="mt-1 font-display text-lg text-ink-900 dark:text-ink-50">
                {sections.hero?.title}
              </p>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
                Theme: <strong>{website.theme}</strong> · Model: {website.sectionsModel}
              </p>
            </div>
            {org.publicSlug && (
              <Link
                to={`/schools/${org.publicSlug}`}
                className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                View live →
              </Link>
            )}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Intake — answer these and we'll generate your site
        </h2>
        <Form method="post" className="mt-4 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="intent" value="save-intake-generate" />
          <Field label="School name">
            <TextInput name="schoolName" required defaultValue={intake.schoolName ?? org.name} />
          </Field>
          <Field label="Primary city you serve">
            <TextInput name="city" required defaultValue={intake.city ?? ""} placeholder="e.g. Eagan" />
          </Field>
          <Field label="State / region">
            <TextInput
              name="region"
              defaultValue={intake.region ?? (org.jurisdiction?.replace("US-", "") ?? "")}
              placeholder="MN"
            />
          </Field>
          <Field label="Three words that describe your vibe">
            <TextInput
              name="vibeWords"
              defaultValue={intake.vibeWords ?? ""}
              placeholder="patient, professional, local"
            />
          </Field>
          <Field
            label="What makes you different?"
            hint="Honest, specific. No 'world-class' please."
          >
            <TextArea
              name="whatMakesUsDifferent"
              defaultValue={intake.whatMakesUsDifferent ?? ""}
              placeholder="e.g. We're the only school in town that runs Saturday morning BTW lessons, and our instructors are all retired police officers."
              className="min-h-[5rem]"
            />
          </Field>
          <Field label="Years in business">
            <TextInput
              name="yearsExperience"
              defaultValue={intake.yearsExperience ?? ""}
              placeholder="3 or '(brand new)'"
            />
          </Field>
          <Field label="Programs offered">
            <TextInput
              name="programsOffered"
              defaultValue={intake.programsOffered ?? "Teen Driver Ed, Behind-the-wheel"}
            />
          </Field>
          <Field label="Instructor background">
            <TextInput
              name="instructorBackground"
              defaultValue={intake.instructorBackground ?? ""}
              placeholder="State-certified, X years average experience"
            />
          </Field>
          <Field label="Hours">
            <TextInput
              name="hours"
              defaultValue={intake.hours ?? ""}
              placeholder="M-F 9am-6pm, Sat 8am-2pm"
            />
          </Field>
          <Field label="Phone">
            <TextInput
              name="phone"
              type="tel"
              defaultValue={intake.phone ?? ""}
              placeholder="(555) 123-4567"
            />
          </Field>
          <Field label="Email">
            <TextInput
              name="email"
              type="email"
              defaultValue={intake.email ?? ""}
              placeholder="hello@yourschool.com"
            />
          </Field>
          <Field
            label="Common questions parents ask"
            hint="Comma-separated. We'll write FAQ answers for them."
          >
            <TextArea
              name="faqAnchors"
              defaultValue={intake.faqAnchors ?? ""}
              placeholder="how soon can my kid start, what's the cancellation policy, do you do pickup"
              className="min-h-[4rem]"
            />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" variant="brand" disabled={submitting}>
              {submitting
                ? "Generating…"
                : website?.sectionsGeneratedAt
                  ? "Regenerate website"
                  : "Generate my website"}
            </Button>
            <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
              Takes about 30 seconds. Generation runs on Workers AI (Llama 3.3 70b).
            </p>
          </div>
        </Form>
      </Card>

      {website?.sectionsGeneratedAt && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            Theme
          </h2>
          <Form method="post" className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <input type="hidden" name="intent" value="set-theme" />
            {THEMES.map((t) => (
              <label
                key={t.key}
                className={[
                  "cursor-pointer rounded-2xl border p-4 transition",
                  website.theme === t.key
                    ? "border-brand-500 bg-brand-50/50 dark:border-brand-400 dark:bg-brand-950/30"
                    : "border-ink-200 bg-white/60 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900/40 dark:hover:border-brand-700",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="theme"
                  value={t.key}
                  defaultChecked={website.theme === t.key}
                  className="sr-only"
                />
                <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">
                  {t.name}
                </p>
                <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{t.blurb}</p>
              </label>
            ))}
            <div className="md:col-span-4">
              <Button type="submit" variant="secondary" disabled={submitting}>
                Apply theme
              </Button>
            </div>
          </Form>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Custom domain
        </h2>
        <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
          Point your own domain (like <code className="font-mono">mountainsidedriving.com</code>) at
          your directio site. We'll provision SSL automatically once you verify ownership.
        </p>
        <Form method="post" className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="set-custom-domain" />
          <Field label="Your domain">
            <TextInput
              name="customDomain"
              type="text"
              placeholder="yourschool.com"
              defaultValue={website?.customDomain ?? ""}
              className="min-w-[260px]"
            />
          </Field>
          <Button type="submit" disabled={submitting}>
            {website?.customDomain ? "Update domain" : "Add domain"}
          </Button>
        </Form>

        {website?.customDomain && (
          <div className="mt-6 rounded-2xl border border-ink-200 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-900/40">
            {website.customDomainVerifiedAt ? (
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                  ✓ Verified · {new Date(website.customDomainVerifiedAt).toLocaleString()}
                </p>
                <p className="mt-1 text-base font-semibold text-ink-900 dark:text-ink-50">
                  https://{website.customDomain}
                </p>
                <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">
                  Your site is live at your custom domain. SSL is auto-provisioned by Cloudflare;
                  give it up to an hour if HTTPS isn't responding yet.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-sm text-ink-700 dark:text-ink-200">
                <p className="font-medium text-ink-900 dark:text-ink-50">
                  Two DNS records to add at your registrar:
                </p>
                <div className="rounded-xl border border-ink-200 bg-white/70 p-3 font-mono text-xs dark:border-ink-800 dark:bg-ink-900/60">
                  <p>
                    <strong>1) CNAME</strong> — point your domain at our site host:
                  </p>
                  <p className="mt-1">
                    {website.customDomain} &nbsp;→&nbsp; sites.directio.app
                  </p>
                </div>
                <div className="rounded-xl border border-ink-200 bg-white/70 p-3 font-mono text-xs dark:border-ink-800 dark:bg-ink-900/60">
                  <p>
                    <strong>2) TXT</strong> — at _directio-verify.{website.customDomain}:
                  </p>
                  <p className="mt-1 break-all">{website.customDomainVerifyToken}</p>
                </div>
                <Form method="post">
                  <input type="hidden" name="intent" value="verify-custom-domain" />
                  <Button type="submit" disabled={submitting}>
                    Check DNS now
                  </Button>
                </Form>
                <p className="text-xs text-ink-500 dark:text-ink-400">
                  DNS usually propagates in a few minutes; rarely up to an hour. Once we see the
                  TXT record, your site goes live with HTTPS on your domain.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
