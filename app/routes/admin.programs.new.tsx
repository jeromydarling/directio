import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.programs.new";
import { requireTenant } from "~/lib/tenant.server";
import { newId, slugify } from "~/lib/ids";
import { PageHeader, Button, LinkButton } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

const KINDS = [
  { value: "teen", label: "Teen driver education" },
  { value: "adult", label: "Adult driver education" },
  { value: "refresher", label: "Refresher course" },
  { value: "road_test_prep", label: "Road test prep" },
] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireTenant(request, context.cloudflare.env);
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) return data({ error: "Name is required." }, { status: 400 });
  if (!KINDS.some((k) => k.value === kind))
    return data({ error: "Pick a program kind." }, { status: 400 });

  const id = newId();
  const slug = slugify(name) || id.slice(0, 8);
  const now = Date.now();

  try {
    await context.cloudflare.env.DB.prepare(
      `INSERT INTO program (id, organizationId, slug, name, kind, description, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    )
      .bind(id, tenant.organization.id, slug, name, kind, description || null, now, now)
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create program.";
    return data({ error: message }, { status: 400 });
  }

  return redirect(`/admin/programs/${id}`);
}

export default function NewProgram({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="New program"
        title="Add a program"
        description="Programs anchor everything else. Define the program first, then add pricing packages."
        actions={
          <LinkButton to="/admin/programs" variant="ghost">
            Cancel
          </LinkButton>
        }
      />

      <Form method="post" className="flex max-w-xl flex-col gap-4">
        <Field label="Program name">
          <TextInput
            name="name"
            type="text"
            required
            placeholder="Teen Driver Education"
            autoFocus
          />
        </Field>
        <Field label="Kind">
          <Select name="kind" defaultValue="teen" required>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" hint="Optional. What's included, what's the audience, what's the outcome.">
          <TextArea
            name="description"
            placeholder="30 hours of classroom + 6 hours behind-the-wheel, MN-aligned curriculum."
          />
        </Field>
        <FormError message={actionData && "error" in actionData ? actionData.error : null} />
        <div className="mt-2 flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create program"}
          </Button>
        </div>
      </Form>
    </div>
  );
}
