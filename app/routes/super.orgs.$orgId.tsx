import { Form, Link, data, redirect } from "react-router";
import type { Route } from "./+types/super.orgs.$orgId";
import {
  requirePlatformAdmin,
  healthBand,
  recomputeAndPersistHealth,
} from "~/lib/super.server";
import { newId } from "~/lib/ids";
import { sendEmail, isEmailConfigured } from "~/lib/email.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export function meta({ data: d }: Route.MetaArgs) {
  const name = d?.org?.name ?? "Organization";
  return [
    { title: `${name} · super · directio` },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const orgId = params.orgId;

  const org = await env.DB.prepare(
    `SELECT id, name, slug, publicSlug, publicTagline, publicPublishedAt,
            jurisdiction, stripeChargesEnabled, stripeAccountId, brandColor,
            createdAt, crmHealthScore, crmHealthComputedAt,
            crmLat, crmLng, crmCity, crmRegion,
            dailyDigestRecipientEmail
       FROM organization WHERE id = ?`,
  )
    .bind(orgId)
    .first<{
      id: string;
      name: string;
      slug: string;
      publicSlug: string | null;
      publicTagline: string | null;
      publicPublishedAt: number | null;
      jurisdiction: string | null;
      stripeChargesEnabled: number;
      stripeAccountId: string | null;
      brandColor: string | null;
      createdAt: number;
      crmHealthScore: number;
      crmHealthComputedAt: number | null;
      crmLat: number | null;
      crmLng: number | null;
      crmCity: string | null;
      crmRegion: string | null;
      dailyDigestRecipientEmail: string | null;
    }>();

  if (!org) throw new Response("Not found", { status: 404 });

  const now = Date.now();
  // Recompute health if stale (>24h) so the detail page is fresh
  // without pushing the cost onto every list-page load.
  if (!org.crmHealthComputedAt || now - org.crmHealthComputedAt > DAY_MS) {
    const score = await recomputeAndPersistHealth(env, org.id, org.createdAt, now);
    org.crmHealthScore = score;
    org.crmHealthComputedAt = now;
  }

  const [members, notes, comms, orgTags, allTags, stats] = await Promise.all([
    env.DB.prepare(
      `SELECT m.role, u.id AS userId, u.name, u.email, u.updatedAt
         FROM member m JOIN user u ON u.id = m.userId
        WHERE m.organizationId = ? ORDER BY m.role, u.name`,
    )
      .bind(orgId)
      .all<{
        role: string;
        userId: string;
        name: string | null;
        email: string;
        updatedAt: number;
      }>(),
    env.DB.prepare(
      `SELECT id, body, authorName, pinned, createdAt
         FROM crm_note WHERE organizationId = ?
        ORDER BY pinned DESC, createdAt DESC LIMIT 50`,
    )
      .bind(orgId)
      .all<{
        id: string;
        body: string;
        authorName: string | null;
        pinned: number;
        createdAt: number;
      }>(),
    env.DB.prepare(
      `SELECT id, kind, direction, subject, body, actorName, toEmail, occurredAt
         FROM crm_communication WHERE organizationId = ?
        ORDER BY occurredAt DESC LIMIT 50`,
    )
      .bind(orgId)
      .all<{
        id: string;
        kind: string;
        direction: string;
        subject: string | null;
        body: string;
        actorName: string | null;
        toEmail: string | null;
        occurredAt: number;
      }>(),
    env.DB.prepare(
      `SELECT t.id, t.label, t.color
         FROM crm_org_tag ot JOIN crm_tag t ON t.id = ot.tagId
        WHERE ot.organizationId = ? ORDER BY t.label`,
    )
      .bind(orgId)
      .all<{ id: string; label: string; color: string | null }>(),
    env.DB.prepare(
      `SELECT id, label FROM crm_tag ORDER BY label`,
    ).all<{ id: string; label: string }>(),
    (async () => {
      const [enroll, appts, revenue] = await Promise.all([
        env.DB.prepare(
          `SELECT COUNT(*) AS n FROM enrollment WHERE organizationId = ?`,
        )
          .bind(orgId)
          .first<{ n: number }>(),
        env.DB.prepare(
          `SELECT COUNT(*) AS n FROM appointment WHERE organizationId = ? AND status = 'completed'`,
        )
          .bind(orgId)
          .first<{ n: number }>(),
        env.DB.prepare(
          `SELECT COALESCE(SUM(schoolNetCents), 0) AS cents FROM payment
            WHERE organizationId = ? AND status = 'succeeded'`,
        )
          .bind(orgId)
          .first<{ cents: number }>(),
      ]);
      return {
        enrollments: enroll?.n ?? 0,
        completedAppointments: appts?.n ?? 0,
        lifetimeRevenueCents: revenue?.cents ?? 0,
      };
    })(),
  ]);

  const primaryContact = members.results.find((m) => m.role === "owner")
    ?? members.results.find((m) => m.role === "admin")
    ?? members.results[0];

  return {
    org,
    members: members.results,
    primaryContact,
    notes: notes.results,
    comms: comms.results,
    orgTags: orgTags.results,
    allTags: allTags.results,
    stats,
  };
}

export async function action({ params, request, context }: Route.ActionArgs) {
  const { user } = await requirePlatformAdmin(request, context.cloudflare.env);
  const env = context.cloudflare.env;
  const orgId = params.orgId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const now = Date.now();

  if (intent === "add-note") {
    const body = String(form.get("body") ?? "").trim();
    if (!body) return data({ error: "Note cannot be empty." }, { status: 400 });
    const pinned = form.get("pinned") === "on" ? 1 : 0;
    await env.DB.prepare(
      `INSERT INTO crm_note (id, organizationId, authorUserId, authorName, body, pinned, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId(), orgId, user.id, user.name ?? user.email, body, pinned, now)
      .run();
    return redirect(`/super/orgs/${orgId}`);
  }

  if (intent === "toggle-note-pin") {
    const noteId = String(form.get("noteId") ?? "");
    if (!noteId) return data({ error: "Missing noteId" }, { status: 400 });
    await env.DB.prepare(
      `UPDATE crm_note SET pinned = 1 - pinned, updatedAt = ? WHERE id = ? AND organizationId = ?`,
    )
      .bind(now, noteId, orgId)
      .run();
    return redirect(`/super/orgs/${orgId}`);
  }

  if (intent === "log-comm") {
    const kind = String(form.get("kind") ?? "note");
    const subject = String(form.get("subject") ?? "").trim() || null;
    const body = String(form.get("body") ?? "").trim();
    if (!body) return data({ error: "Body cannot be empty." }, { status: 400 });
    await env.DB.prepare(
      `INSERT INTO crm_communication
        (id, organizationId, actorUserId, actorName, kind, direction, subject, body, occurredAt, createdAt)
       VALUES (?, ?, ?, ?, ?, 'outbound', ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        orgId,
        user.id,
        user.name ?? user.email,
        kind,
        subject,
        body,
        now,
        now,
      )
      .run();
    return redirect(`/super/orgs/${orgId}`);
  }

  if (intent === "send-email") {
    if (!isEmailConfigured(env)) {
      return data({ error: "Email binding is not configured." }, { status: 400 });
    }
    const to = String(form.get("to") ?? "").trim();
    const subject = String(form.get("subject") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();
    if (!to || !subject || !body) {
      return data(
        { error: "To, subject, and body are all required." },
        { status: 400 },
      );
    }
    const { id: sentId } = await sendEmail(env, {
      to,
      subject,
      html: `<p>${escape(body).replace(/\n/g, "<br>")}</p>`,
      text: body,
    });
    await env.DB.prepare(
      `INSERT INTO crm_communication
        (id, organizationId, actorUserId, actorName, kind, direction, subject, body, toEmail, sentEmailId, occurredAt, createdAt)
       VALUES (?, ?, ?, ?, 'email', 'outbound', ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        orgId,
        user.id,
        user.name ?? user.email,
        subject,
        body,
        to,
        sentId || null,
        now,
        now,
      )
      .run();
    return redirect(`/super/orgs/${orgId}`);
  }

  if (intent === "toggle-tag") {
    const tagId = String(form.get("tagId") ?? "");
    if (!tagId) return data({ error: "Missing tagId" }, { status: 400 });
    const exists = await env.DB.prepare(
      `SELECT 1 AS one FROM crm_org_tag WHERE organizationId = ? AND tagId = ?`,
    )
      .bind(orgId, tagId)
      .first<{ one: number }>();
    if (exists) {
      await env.DB.prepare(
        `DELETE FROM crm_org_tag WHERE organizationId = ? AND tagId = ?`,
      )
        .bind(orgId, tagId)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO crm_org_tag (organizationId, tagId, addedByUserId, addedAt)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(orgId, tagId, user.id, now)
        .run();
    }
    return redirect(`/super/orgs/${orgId}`);
  }

  if (intent === "create-tag") {
    const label = String(form.get("label") ?? "").trim();
    if (!label) return data({ error: "Tag label required." }, { status: 400 });
    try {
      await env.DB.prepare(
        `INSERT INTO crm_tag (id, label, createdAt) VALUES (?, ?, ?)`,
      )
        .bind(newId(), label, now)
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tag creation failed.";
      return data({ error: msg }, { status: 400 });
    }
    return redirect(`/super/orgs/${orgId}`);
  }

  if (intent === "save-location") {
    const city = String(form.get("city") ?? "").trim() || null;
    const region = String(form.get("region") ?? "").trim() || null;
    const latRaw = String(form.get("lat") ?? "").trim();
    const lngRaw = String(form.get("lng") ?? "").trim();
    const lat = latRaw ? Number(latRaw) : null;
    const lng = lngRaw ? Number(lngRaw) : null;
    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
      return data({ error: "Latitude/longitude must be numbers." }, { status: 400 });
    }
    await env.DB.prepare(
      `UPDATE organization SET crmCity = ?, crmRegion = ?, crmLat = ?, crmLng = ? WHERE id = ?`,
    )
      .bind(city, region, lat, lng, orgId)
      .run();
    return redirect(`/super/orgs/${orgId}`);
  }

  return data({ error: "Unknown intent." }, { status: 400 });
}

export default function SuperOrgDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { org, members, primaryContact, notes, comms, orgTags, allTags, stats } =
    loaderData;
  const band = healthBand(org.crmHealthScore);
  const activeTagIds = new Set(orgTags.map((t) => t.id));
  const errorMsg =
    actionData && "error" in actionData ? actionData.error : undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">
            <Link to="/super/orgs" className="hover:underline">
              ← All organizations
            </Link>
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
            {org.name}
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Signed up {new Date(org.createdAt).toISOString().slice(0, 10)}
            {org.jurisdiction ? ` · ${org.jurisdiction}` : ""}
            {org.publicSlug ? (
              <>
                {" · "}
                <a
                  href={`/schools/${org.publicSlug}`}
                  className="text-brand-600 hover:underline dark:text-brand-300"
                  target="_blank"
                  rel="noreferrer"
                >
                  /schools/{org.publicSlug}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <HealthCard score={org.crmHealthScore} band={band} />
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Lifetime revenue" value={money(stats.lifetimeRevenueCents)} />
        <Stat label="Enrollments" value={stats.enrollments.toLocaleString()} />
        <Stat label="Lessons completed" value={stats.completedAppointments.toLocaleString()} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Panel title="Notes">
            <Form method="post" className="flex flex-col gap-2">
              <input type="hidden" name="intent" value="add-note" />
              <textarea
                name="body"
                rows={2}
                placeholder="What did you learn about this school today?"
                className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                  <input type="checkbox" name="pinned" /> pin
                </label>
                <button
                  type="submit"
                  className="rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-ink-50 dark:text-ink-900"
                >
                  Add note
                </button>
              </div>
            </Form>
            <ul className="mt-4 divide-y divide-ink-200 dark:divide-ink-800">
              {notes.map((n) => (
                <li key={n.id} className="py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink-500 dark:text-ink-400">
                      {n.authorName ?? "?"}
                      {" · "}
                      {new Date(n.createdAt).toISOString().replace("T", " ").slice(0, 16)}
                    </span>
                    <Form method="post">
                      <input type="hidden" name="intent" value="toggle-note-pin" />
                      <input type="hidden" name="noteId" value={n.id} />
                      <button
                        type="submit"
                        className="text-xs text-ink-400 hover:text-brand-500"
                      >
                        {n.pinned ? "unpin" : "pin"}
                      </button>
                    </Form>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-ink-700 dark:text-ink-200">
                    {n.body}
                  </p>
                </li>
              ))}
              {notes.length === 0 && (
                <li className="py-6 text-center text-sm text-ink-400">
                  No notes yet.
                </li>
              )}
            </ul>
          </Panel>

          <Panel title="Communications">
            <div className="grid gap-2 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
              <p className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">
                Send an email
              </p>
              <Form method="post" className="flex flex-col gap-2">
                <input type="hidden" name="intent" value="send-email" />
                <input
                  name="to"
                  type="email"
                  defaultValue={
                    org.dailyDigestRecipientEmail ?? primaryContact?.email ?? ""
                  }
                  placeholder="to@example.com"
                  className="w-full rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                />
                <input
                  name="subject"
                  placeholder="Subject"
                  className="w-full rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                />
                <textarea
                  name="body"
                  rows={4}
                  placeholder="Body"
                  className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950"
                />
                <button
                  type="submit"
                  className="w-max rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Send + log
                </button>
              </Form>
            </div>

            <div className="mt-4 grid gap-2 rounded-xl border border-ink-200 p-3 dark:border-ink-800">
              <p className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">
                Log a touch (call, meeting)
              </p>
              <Form method="post" className="flex flex-col gap-2">
                <input type="hidden" name="intent" value="log-comm" />
                <select
                  name="kind"
                  className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                >
                  <option value="call">Call</option>
                  <option value="meeting">Meeting</option>
                  <option value="note">Other</option>
                </select>
                <input
                  name="subject"
                  placeholder="Summary (optional)"
                  className="w-full rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                />
                <textarea
                  name="body"
                  rows={3}
                  placeholder="What happened?"
                  className="w-full rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-950"
                />
                <button
                  type="submit"
                  className="w-max rounded-lg bg-ink-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-ink-50 dark:text-ink-900"
                >
                  Log
                </button>
              </Form>
            </div>

            <ul className="mt-4 divide-y divide-ink-200 dark:divide-ink-800">
              {comms.map((c) => (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-ink-500 dark:text-ink-400">
                      <span className="mr-2 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] uppercase tracking-widest dark:bg-ink-800">
                        {c.kind}
                      </span>
                      {c.actorName ?? "?"}
                      {" · "}
                      {new Date(c.occurredAt).toISOString().replace("T", " ").slice(0, 16)}
                      {c.toEmail ? ` → ${c.toEmail}` : ""}
                    </span>
                  </div>
                  {c.subject && (
                    <p className="mt-1 font-medium text-ink-800 dark:text-ink-100">
                      {c.subject}
                    </p>
                  )}
                  <p className="mt-0.5 whitespace-pre-wrap text-ink-600 dark:text-ink-300">
                    {c.body}
                  </p>
                </li>
              ))}
              {comms.length === 0 && (
                <li className="py-6 text-center text-sm text-ink-400">
                  Nothing logged yet.
                </li>
              )}
            </ul>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Primary contact">
            {primaryContact ? (
              <div className="text-sm">
                <p className="font-medium text-ink-900 dark:text-ink-50">
                  {primaryContact.name ?? primaryContact.email}
                </p>
                <p className="text-ink-500 dark:text-ink-400">
                  <a
                    href={`mailto:${primaryContact.email}`}
                    className="hover:underline"
                  >
                    {primaryContact.email}
                  </a>
                </p>
                <p className="mt-1 text-xs uppercase tracking-widest text-ink-400">
                  {primaryContact.role}
                </p>
              </div>
            ) : (
              <p className="text-sm text-ink-400">No members found.</p>
            )}
            {members.length > 1 && (
              <details className="mt-3 text-xs text-ink-500 dark:text-ink-400">
                <summary className="cursor-pointer">
                  {members.length - 1} other member{members.length - 1 === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 space-y-1">
                  {members
                    .filter((m) => m.userId !== primaryContact?.userId)
                    .map((m) => (
                      <li key={m.userId}>
                        <span className="text-ink-700 dark:text-ink-200">
                          {m.name ?? m.email}
                        </span>{" "}
                        <span className="text-ink-400">· {m.role}</span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Panel>

          <Panel title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {allTags.map((t) => {
                const on = activeTagIds.has(t.id);
                return (
                  <Form key={t.id} method="post">
                    <input type="hidden" name="intent" value="toggle-tag" />
                    <input type="hidden" name="tagId" value={t.id} />
                    <button
                      type="submit"
                      className={[
                        "rounded-full border px-2.5 py-0.5 text-xs",
                        on
                          ? "border-brand-500 bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200"
                          : "border-ink-300 bg-white text-ink-500 hover:border-brand-300 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-400",
                      ].join(" ")}
                    >
                      {t.label}
                    </button>
                  </Form>
                );
              })}
            </div>
            <Form method="post" className="mt-3 flex gap-2">
              <input type="hidden" name="intent" value="create-tag" />
              <input
                name="label"
                placeholder="new tag"
                className="flex-1 rounded-lg border border-ink-300 bg-white px-2 py-1 text-sm dark:border-ink-700 dark:bg-ink-950"
              />
              <button
                type="submit"
                className="rounded-lg bg-ink-900 px-2 py-1 text-xs font-medium text-white dark:bg-ink-50 dark:text-ink-900"
              >
                +
              </button>
            </Form>
          </Panel>

          <Panel title="Location">
            <Form method="post" className="grid gap-2">
              <input type="hidden" name="intent" value="save-location" />
              <input
                name="city"
                defaultValue={org.crmCity ?? ""}
                placeholder="City"
                className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
              />
              <input
                name="region"
                defaultValue={org.crmRegion ?? ""}
                placeholder="State / region"
                className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  name="lat"
                  defaultValue={org.crmLat ?? ""}
                  placeholder="Lat"
                  className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                />
                <input
                  name="lng"
                  defaultValue={org.crmLng ?? ""}
                  placeholder="Lng"
                  className="rounded-lg border border-ink-300 bg-white px-3 py-1.5 text-sm dark:border-ink-700 dark:bg-ink-950"
                />
              </div>
              <button
                type="submit"
                className="w-max rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-ink-50 dark:text-ink-900"
              >
                Save location
              </button>
            </Form>
          </Panel>

          <Panel title="Platform status">
            <ul className="space-y-1 text-sm text-ink-600 dark:text-ink-300">
              <li>
                Stripe:{" "}
                {org.stripeChargesEnabled ? (
                  <span className="text-emerald-600 dark:text-emerald-300">connected</span>
                ) : (
                  <span className="text-rose-500">not connected</span>
                )}
              </li>
              <li>
                Public site:{" "}
                {org.publicPublishedAt ? (
                  <span className="text-emerald-600 dark:text-emerald-300">
                    published {new Date(org.publicPublishedAt).toISOString().slice(0, 10)}
                  </span>
                ) : (
                  <span className="text-ink-400">not published</span>
                )}
              </li>
              <li>
                Digest recipient:{" "}
                {org.dailyDigestRecipientEmail ?? (
                  <span className="text-ink-400">not set</span>
                )}
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function HealthCard({
  score,
  band,
}: {
  score: number;
  band: "healthy" | "watch" | "at-risk";
}) {
  const cls =
    band === "healthy"
      ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200"
      : band === "watch"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
        : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-200";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-right ${cls}`}>
      <p className="text-xs uppercase tracking-widest">Health</p>
      <p className="font-display text-3xl font-semibold">{score}</p>
      <p className="text-xs">{band}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
      <p className="text-xs uppercase tracking-widest text-ink-500 dark:text-ink-400">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
        {value}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900">
      <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}
