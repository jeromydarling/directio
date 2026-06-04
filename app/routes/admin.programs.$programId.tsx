import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.programs.$programId";
import { requireTenant } from "~/lib/tenant.server";
import { newId } from "~/lib/ids";
import { PageHeader, Card, EmptyState, Button, LinkButton } from "~/components/ui";
import { Field, FormError, TextInput } from "~/components/form";

const KIND_LABEL: Record<string, string> = {
  teen: "Teen",
  adult: "Adult",
  refresher: "Refresher",
  road_test_prep: "Road test prep",
};

type ProgramRow = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  active: number;
};

type PackageRow = {
  id: string;
  name: string;
  priceCents: number;
  btwLessonCount: number;
  active: number;
};

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const db = context.cloudflare.env.DB;

  const program = await db
    .prepare(
      "SELECT id, name, kind, description, active FROM program WHERE id = ? AND organizationId = ?",
    )
    .bind(params.programId, tenant.organization.id)
    .first<ProgramRow>();

  if (!program) throw new Response("Program not found", { status: 404 });

  const packages = await db
    .prepare(
      "SELECT id, name, priceCents, btwLessonCount, active FROM programPackage WHERE programId = ? AND organizationId = ? ORDER BY priceCents",
    )
    .bind(params.programId, tenant.organization.id)
    .all<PackageRow>();

  return { program, packages: packages.results };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  const formData = await request.formData();

  const intent = String(formData.get("intent") ?? "");

  if (intent === "add-package") {
    const name = String(formData.get("name") ?? "").trim();
    const priceDollars = parseFloat(String(formData.get("price") ?? "0"));
    const btwLessons = parseInt(String(formData.get("btwLessons") ?? "0"), 10);
    const platformFeeBps = parseInt(String(formData.get("platformFeeBps") ?? "250"), 10);
    const installmentsAllowed = formData.get("installmentsAllowed") === "on";
    const installmentMonths = parseInt(String(formData.get("installmentMonths") ?? "3"), 10);
    const bnplOn = formData.get("bnpl") === "on";

    if (!name) return data({ error: "Package name required." }, { status: 400 });
    if (!Number.isFinite(priceDollars) || priceDollars < 0)
      return data({ error: "Price must be a non-negative number." }, { status: 400 });
    if (!Number.isFinite(btwLessons) || btwLessons < 0)
      return data({ error: "Behind-the-wheel lesson count must be a non-negative integer." }, {
        status: 400,
      });

    const paymentOptions = {
      platformFeeBps: Math.max(0, Math.min(2000, platformFeeBps)),
      installmentsAllowed,
      installmentMonths: Math.max(2, Math.min(12, installmentMonths)),
      bnpl: bnplOn ? ["affirm", "klarna"] : [],
    };

    const now = Date.now();
    await context.cloudflare.env.DB.prepare(
      `INSERT INTO programPackage (id, organizationId, programId, name, priceCents, currency, btwLessonCount, paymentOptions, active, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?, ?)`,
    )
      .bind(
        newId(),
        tenant.organization.id,
        params.programId,
        name,
        Math.round(priceDollars * 100),
        btwLessons,
        JSON.stringify(paymentOptions),
        now,
        now,
      )
      .run();
    return redirect(`/admin/programs/${params.programId}`);
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function ProgramDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { program, packages } = loaderData;
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={KIND_LABEL[program.kind] ?? program.kind}
        title={program.name}
        description={program.description ?? undefined}
        actions={
          <LinkButton to="/admin/programs" variant="ghost">
            ← All programs
          </LinkButton>
        }
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Packages
        </h2>
        {packages.length === 0 ? (
          <EmptyState
            title="No packages yet"
            description="A package is the sellable unit — a name, a price, and how many lessons are included."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {packages.map((pk) => (
              <li
                key={pk.id}
                className="rounded-2xl border border-ink-200 bg-white/70 p-5 dark:border-ink-800 dark:bg-ink-900/40"
              >
                <p className="text-lg font-semibold text-ink-900 dark:text-ink-50">{pk.name}</p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
                  ${(pk.priceCents / 100).toFixed(2)}
                </p>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                  {pk.btwLessonCount} behind-the-wheel lesson
                  {pk.btwLessonCount === 1 ? "" : "s"} included
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <h3 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          Add a package
        </h3>
        <Form method="post" className="mt-4 grid gap-4 md:grid-cols-3">
          <input type="hidden" name="intent" value="add-package" />
          <Field label="Name">
            <TextInput name="name" type="text" required placeholder="Standard Teen Package" />
          </Field>
          <Field label="Price (USD)">
            <TextInput
              name="price"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="599.00"
            />
          </Field>
          <Field label="Behind-the-wheel lessons">
            <TextInput
              name="btwLessons"
              type="number"
              min="0"
              step="1"
              required
              defaultValue="6"
            />
          </Field>
          <Field label="Platform fee (basis points)" hint="100 bps = 1%. Default 2.5%.">
            <TextInput
              name="platformFeeBps"
              type="number"
              min="0"
              max="2000"
              step="10"
              defaultValue="250"
            />
          </Field>
          <Field label="Installment months" hint="If installments enabled.">
            <TextInput
              name="installmentMonths"
              type="number"
              min="2"
              max="12"
              defaultValue="3"
            />
          </Field>
          <div className="flex flex-col gap-2 self-end">
            <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
              <input
                type="checkbox"
                name="installmentsAllowed"
                defaultChecked
                className="h-4 w-4 rounded border-ink-300"
              />
              Allow monthly installments (Stripe Subscriptions)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700 dark:text-ink-200">
              <input type="checkbox" name="bnpl" className="h-4 w-4 rounded border-ink-300" />
              Allow buy-now-pay-later (Affirm / Klarna)
            </label>
          </div>
          <div className="md:col-span-3">
            <FormError message={actionData && "error" in actionData ? actionData.error : null} />
            <Button type="submit" disabled={submitting} className="mt-3">
              {submitting ? "Adding…" : "Add package"}
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
