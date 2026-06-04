import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.instructors.new";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { PageHeader, Button, LinkButton } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireTenant(request, context.cloudflare.env);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const formData = await request.formData();

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;

  if (!firstName || !lastName)
    return data({ error: "First and last name are required." }, { status: 400 });

  let userId: string | null = null;
  if (email) {
    const u = await context.cloudflare.env.DB.prepare("SELECT id FROM user WHERE email = ?")
      .bind(email)
      .first<{ id: string }>();
    if (u) userId = u.id;
  }

  const id = newId();
  const now = Date.now();
  try {
    await context.cloudflare.env.DB.prepare(
      `INSERT INTO instructor (id, organizationId, userId, firstName, lastName, email, phone, active, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
      .bind(id, tenant.organization.id, userId, firstName, lastName, email, phone, now)
      .run();

    // If the instructor already has a user account, give them an
    // instructor membership in this org so they can log in to the
    // (future) instructor portal.
    if (userId) {
      await context.cloudflare.env.DB.prepare(
        "INSERT OR IGNORE INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, 'instructor', ?)",
      )
        .bind(newId(), tenant.organization.id, userId, now)
        .run();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add instructor.";
    return data({ error: message }, { status: 400 });
  }

  return redirect(`/admin/instructors/${id}`);
}

export default function NewInstructor({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="New instructor"
        title="Add an instructor"
        description="If they have a directio login already, we'll link automatically. Otherwise, they claim the account when they sign up with this email."
        actions={
          <LinkButton to="/admin/instructors" variant="ghost">
            Cancel
          </LinkButton>
        }
      />

      <Form method="post" className="grid max-w-2xl gap-4 md:grid-cols-2">
        <Field label="First name">
          <TextInput name="firstName" type="text" required autoFocus />
        </Field>
        <Field label="Last name">
          <TextInput name="lastName" type="text" required />
        </Field>
        <Field label="Email">
          <TextInput name="email" type="email" autoComplete="off" />
        </Field>
        <Field label="Phone">
          <TextInput name="phone" type="tel" />
        </Field>
        <div className="md:col-span-2">
          <FormError message={actionData && "error" in actionData ? actionData.error : null} />
          <Button type="submit" disabled={submitting} className="mt-3">
            {submitting ? "Adding…" : "Add instructor"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
