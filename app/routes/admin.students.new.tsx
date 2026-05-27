import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.students.new";
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
  const dateOfBirth = String(formData.get("dateOfBirth") ?? "").trim() || null;

  if (!firstName || !lastName)
    return data({ error: "First and last name are required." }, { status: 400 });

  // If a user with this email already exists, link them. This lets a
  // parent or student claim the record by signing up with that email.
  let userId: string | null = null;
  if (email) {
    const u = await context.cloudflare.env.DB.prepare(
      "SELECT id FROM user WHERE email = ?",
    )
      .bind(email)
      .first<{ id: string }>();
    if (u) userId = u.id;
  }

  const id = newId();
  const now = Date.now();
  try {
    await context.cloudflare.env.DB.prepare(
      `INSERT INTO student (id, organizationId, userId, firstName, lastName, dateOfBirth, email, phone, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, tenant.organization.id, userId, firstName, lastName, dateOfBirth, email, phone, now, now)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add student.";
    return data({ error: message }, { status: 400 });
  }

  return redirect(`/admin/students/${id}`);
}

export default function NewStudent({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="New student"
        title="Add a student"
        description="A student needs at least a name. Adding their email lets them claim the record when they sign up."
        actions={
          <LinkButton to="/admin/students" variant="ghost">
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
        <Field
          label="Email"
          hint="If they already have a directio account, they'll be linked automatically."
        >
          <TextInput name="email" type="email" autoComplete="off" />
        </Field>
        <Field label="Phone">
          <TextInput name="phone" type="tel" />
        </Field>
        <Field label="Date of birth" hint="YYYY-MM-DD">
          <TextInput name="dateOfBirth" type="date" />
        </Field>
        <div className="md:col-span-2">
          <FormError message={actionData && "error" in actionData ? actionData.error : null} />
          <Button type="submit" disabled={submitting} className="mt-3">
            {submitting ? "Adding…" : "Add student"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
