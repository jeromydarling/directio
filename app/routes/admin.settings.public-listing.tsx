import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.settings.public-listing";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import { PageHeader, Card, Button, LinkButton } from "~/components/ui";
import { Field, FormError, TextArea, TextInput } from "~/components/form";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  publicSlug: string | null;
  publicTagline: string | null;
  publicAbout: string | null;
  publicPublishedAt: number | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const org = await context.cloudflare.env.DB.prepare(
    "SELECT id, name, slug, publicSlug, publicTagline, publicAbout, publicPublishedAt FROM organization WHERE id = ?",
  )
    .bind(tenant.organization.id)
    .first<OrgRow>();
  if (!org) throw new Response("Not found", { status: 404 });
  return { org, appUrl: context.cloudflare.env.APP_URL };
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin")
    return data({ error: "Not allowed." }, { status: 403 });
  const env = context.cloudflare.env;
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const now = Date.now();

  if (intent === "save") {
    const publicSlug = String(formData.get("publicSlug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const publicTagline = String(formData.get("publicTagline") ?? "").trim() || null;
    const publicAbout = String(formData.get("publicAbout") ?? "").trim() || null;
    if (!publicSlug) return data({ error: "Pick a slug for your public page." }, { status: 400 });

    // Conflict check.
    const conflict = await env.DB.prepare(
      "SELECT id FROM organization WHERE publicSlug = ? AND id != ?",
    )
      .bind(publicSlug, tenant.organization.id)
      .first<{ id: string }>();
    if (conflict)
      return data({ error: "Another school already uses that slug." }, { status: 400 });

    await env.DB.prepare(
      `UPDATE organization
          SET publicSlug = ?, publicTagline = ?, publicAbout = ?, updatedAt = ?
        WHERE id = ?`,
    )
      .bind(publicSlug, publicTagline, publicAbout, now, tenant.organization.id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "public_listing.saved",
      entityType: "organization",
      entityId: tenant.organization.id,
      payload: { publicSlug },
    });
    return redirect("/admin/settings/public-listing");
  }

  if (intent === "publish" || intent === "unpublish") {
    const newPublishedAt = intent === "publish" ? now : null;
    await env.DB.prepare(
      "UPDATE organization SET publicPublishedAt = ?, updatedAt = ? WHERE id = ?",
    )
      .bind(newPublishedAt, now, tenant.organization.id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: `public_listing.${intent}d`,
      entityType: "organization",
      entityId: tenant.organization.id,
    });
    return redirect("/admin/settings/public-listing");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function PublicListing({ loaderData, actionData }: Route.ComponentProps) {
  const { org, appUrl } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const published = Boolean(org.publicPublishedAt);
  const publicUrl = org.publicSlug ? `${appUrl}/schools/${org.publicSlug}` : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Settings"
        title="Public catalog page"
        description="Publish a public landing page so families can find you and start enrollment without a referral link."
        actions={
          <LinkButton to="/admin/settings" variant="ghost">
            ← Settings
          </LinkButton>
        }
      />

      <FormError message={actionData && "error" in actionData ? actionData.error : null} />

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
              Status
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
              {published ? "Live" : "Draft"}
            </p>
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm text-brand-600 hover:underline dark:text-brand-300"
              >
                {publicUrl}
              </a>
            )}
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value={published ? "unpublish" : "publish"} />
            <Button type="submit" variant={published ? "secondary" : "primary"} disabled={submitting || !org.publicSlug}>
              {published ? "Unpublish" : "Publish"}
            </Button>
          </Form>
        </div>
      </Card>

      <Card>
        <Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="save" />
          <Field label="Public URL slug" hint="Lowercase letters, numbers, and dashes only.">
            <TextInput
              name="publicSlug"
              type="text"
              required
              defaultValue={org.publicSlug ?? slugify(org.name)}
              placeholder={slugify(org.name)}
            />
          </Field>
          <Field label="Tagline" hint="One sentence families will see under your name.">
            <TextInput
              name="publicTagline"
              type="text"
              defaultValue={org.publicTagline ?? ""}
              placeholder="Driver education for the way Minnesota teens actually learn."
            />
          </Field>
          <Field
            label="About"
            hint="A few short paragraphs about your school. Markdown isn't supported here yet; plain text only."
          >
            <TextArea
              name="publicAbout"
              defaultValue={org.publicAbout ?? ""}
              className="min-h-[10rem]"
            />
          </Field>
          <div>
            <Button type="submit" disabled={submitting}>
              Save
            </Button>
          </div>
        </Form>
      </Card>

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          What families see
        </h3>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-ink-700 dark:text-ink-200">
          <li>Your name, tagline, brand color, and about text.</li>
          <li>Every active program and package with prices.</li>
          <li>A big "Enroll your driver" button.</li>
          <li>
            Enrollment is one form: student name, parent name + email, password, and which
            package. We create the account, the student, the enrollment, and route them straight
            to Stripe checkout.
          </li>
        </ol>
      </Card>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
