import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/admin.state-coverage";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  getEffectiveRules,
  getPeerConfirmations,
  getPendingDraft,
  saveRuleProfile,
} from "~/lib/rules.server";
import {
  ISSUED_BY_OPTIONS,
  STATE_CODES,
  SUBMISSION_OPTIONS,
  type RuleProfileAnswers,
  codeToJurisdiction,
  credentialLabelKey,
  requirementTargetKey,
} from "~/lib/rule-pack";
import { MATURITY_LABEL, STATE_LABEL, whatWeHandle, whatYouStillDo } from "~/lib/state-coverage";
import { PageHeader, Card, Button } from "~/components/ui";
import { Field, FormError, Select, TextArea, TextInput } from "~/components/form";

/**
 * School-facing "your state's rules" page — the (b) half of the state
 * co-build system. The school confirms or corrects what we believe
 * their state requires, sets their own targets, and answers the open
 * questions our research pass couldn't settle. Their targets become
 * school-scoped overrides; their corrections become field reports the
 * platform reviewer sees next to the AI draft.
 */

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (tenant.role !== "owner" && tenant.role !== "admin") throw redirect("/me");
  const url = new URL(request.url);
  const saved = url.searchParams.get("saved") === "1";

  const org = await env.DB.prepare("SELECT jurisdiction FROM organization WHERE id = ?")
    .bind(tenant.organization.id)
    .first<{ jurisdiction: string | null }>();

  const rules = await getEffectiveRules(env, tenant.organization.id);
  if (!rules) {
    return {
      needsState: true as const,
      jurisdiction: org?.jurisdiction ?? null,
      saved,
      orgName: tenant.organization.name,
      rules: null,
      peers: {} as Record<string, { agree: number; total: number }>,
      openQuestions: [],
    };
  }

  const [peers, pending] = await Promise.all([
    getPeerConfirmations(env, {
      stateCode: rules.stateCode,
      excludeOrganizationId: tenant.organization.id,
    }),
    getPendingDraft(env, rules.stateCode),
  ]);
  // Open questions come from the published pack first, then from any
  // research draft awaiting review — the school's answer is useful to
  // the reviewer either way.
  const openQuestions = [...(rules.pack.definition.openQuestions ?? [])];
  for (const q of pending?.definition.openQuestions ?? []) {
    if (!openQuestions.some((x) => x.key === q.key)) openQuestions.push(q);
  }

  return {
    needsState: false as const,
    jurisdiction: org?.jurisdiction ?? null,
    saved,
    orgName: tenant.organization.name,
    rules,
    peers,
    openQuestions: openQuestions.slice(0, 6),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (tenant.role !== "owner" && tenant.role !== "admin")
    return data({ error: "Not allowed." }, { status: 403 });
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "set-jurisdiction") {
    const code = String(formData.get("stateCode") ?? "").toUpperCase().trim();
    if (!STATE_CODES.includes(code)) return data({ error: "Pick your state." }, { status: 400 });
    await env.DB.prepare("UPDATE organization SET jurisdiction = ? WHERE id = ?")
      .bind(codeToJurisdiction(code), tenant.organization.id)
      .run();
    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "organization.jurisdiction_set",
      entityType: "organization",
      entityId: tenant.organization.id,
      payload: { jurisdiction: codeToJurisdiction(code) },
    });
    return redirect("/admin/state-coverage");
  }

  if (intent === "save-profile") {
    const rules = await getEffectiveRules(env, tenant.organization.id);
    if (!rules) return data({ error: "Set your state first." }, { status: 400 });

    const num = (name: string): number | null => {
      const raw = String(formData.get(name) ?? "").trim();
      if (raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const answers: RuleProfileAnswers = {
      stateMinimums: {},
      schoolTargets: {},
      credential: {
        label: String(formData.get("credential.label") ?? "").trim().slice(0, 120),
        issuedBy: String(formData.get("credential.issuedBy") ?? "").trim(),
        submissionMethod: String(formData.get("credential.submissionMethod") ?? "").trim(),
        licenseNumber: String(formData.get("credential.licenseNumber") ?? "").trim().slice(0, 80),
        signerTitle: String(formData.get("credential.signerTitle") ?? "").trim().slice(0, 80),
      },
      openAnswers: {},
      additionalRequirements: String(formData.get("additionalRequirements") ?? "").trim().slice(0, 2000),
      confirmedAccurate: formData.get("confirmedAccurate") === "on",
    };
    for (const r of rules.pack.definition.requirements) {
      const stateMin = num(`stateMin.${r.key}`);
      const target = num(`target.${r.key}`);
      if (Number.isNaN(stateMin) || Number.isNaN(target)) {
        return data({ error: `"${r.label}" needs a number of ${r.unit}s (0 or more).` }, { status: 400 });
      }
      if (stateMin !== null) answers.stateMinimums[r.key] = stateMin;
      if (target !== null) answers.schoolTargets[r.key] = target;
    }
    for (const [k, v] of formData.entries()) {
      if (k.startsWith("open.") && typeof v === "string") {
        answers.openAnswers[k.slice(5).slice(0, 64)] = v.trim().slice(0, 500);
      }
    }

    await saveRuleProfile(env, {
      organizationId: tenant.organization.id,
      userId: tenant.user.id,
      pack: rules.pack,
      answers,
    });
    return redirect("/admin/state-coverage?saved=1");
  }

  return data({ error: "Unknown action." }, { status: 400 });
}

export default function StateRules({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const submitting = nav.state === "submitting";
  const error = actionData && "error" in actionData ? actionData.error : null;

  if (loaderData.needsState || !loaderData.rules) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="State coverage"
          title="Your state's rules"
          description="Tell us where you operate and we'll pre-fill the hours, credential, and agency your state requires."
        />
        <FormError message={error} />
        <Card>
          <Form method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="intent" value="set-jurisdiction" />
            <Field label="Which state is your school in?">
              <Select name="stateCode" required defaultValue="">
                <option value="" disabled>
                  Choose a state
                </option>
                {STATE_CODES.map((c) => (
                  <option key={c} value={c}>
                    {STATE_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={submitting}>
              Continue
            </Button>
          </Form>
        </Card>
      </div>
    );
  }

  const { rules, peers, openQuestions, saved } = loaderData;
  const pack = rules.pack.definition;
  const effective = rules.definition;
  const cred = pack.credentials[0];
  const effectiveCred = effective.credentials[0];
  const answers = rules.profile?.answers ?? null;
  const level = rules.maturity.level;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="State coverage"
        title={`${rules.stateName}'s rules, confirmed by you`}
        description="We pre-filled what our research says your state requires. Confirm it, correct it, and set what your school requires on top. About three minutes."
      />

      {saved && (
        <Card className="border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            Saved. Your school now runs on these numbers.
          </p>
          <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-300">
            Anything you corrected about the state minimums went to our {rules.stateName} research
            queue. When we publish an update we'll show it here.
          </p>
        </Card>
      )}
      <FormError message={error} />

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-brand-700 dark:text-brand-200">
              {rules.stateName} · {rules.stateCode} · pack v{rules.pack.version}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-ink-50">
              Level {level} · {MATURITY_LABEL[level]}
            </p>
            {rules.maturity.lastVerifiedAt && (
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                Last verified {rules.maturity.lastVerifiedAt}
                {rules.pack.draftedBy === "ai" ? " · AI research pass, human-reviewed" : ""}
              </p>
            )}
          </div>
          {rules.profile?.completedAt ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
              Confirmed {new Date(rules.profile.completedAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/60 dark:text-amber-200">
              Not yet confirmed
            </span>
          )}
        </div>
        {pack.summary && (
          <p className="mt-3 text-sm text-ink-700 dark:text-ink-200">{pack.summary}</p>
        )}
        {rules.maturity.legalBlocker && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-100">
            <p className="text-xs font-semibold uppercase tracking-wider">Read this</p>
            <p className="mt-1">{rules.maturity.legalBlocker}</p>
          </div>
        )}
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <p className="text-ink-700 dark:text-ink-200">
            <strong className="text-emerald-700 dark:text-emerald-200">directio handles:</strong>{" "}
            {whatWeHandle(rules.maturity)}.
          </p>
          <p className="text-ink-700 dark:text-ink-200">
            <strong className="text-ink-900 dark:text-ink-50">You still do:</strong>{" "}
            {whatYouStillDo(rules.maturity)}.
          </p>
        </div>
      </Card>

      <Form method="post" className="flex flex-col gap-8">
        <input type="hidden" name="intent" value="save-profile" />

        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            1 · Confirm the numbers
          </h2>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            Left: what we believe the state minimum is — fix it if we're wrong. Right: what{" "}
            <em>your</em> school requires (many schools go above the minimum).
          </p>
          <div className="mt-5 flex flex-col divide-y divide-ink-200/60 dark:divide-ink-800/60">
            {pack.requirements.map((r) => {
              const eff = effective.requirements.find((x) => x.key === r.key);
              const peer = peers[requirementTargetKey(r.key)];
              const overridden = rules.appliedKeys.includes(requirementTargetKey(r.key));
              return (
                <div key={r.key} className="grid gap-4 py-4 md:grid-cols-[1.2fr_1fr_1fr]">
                  <div>
                    <p className="font-medium text-ink-900 dark:text-ink-50">{r.label}</p>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      {r.appliesTo === "all" ? "All students" : "Students under 18"}
                      {r.confidence ? ` · our confidence: ${r.confidence}` : ""}
                      {r.citationUrl && (
                        <>
                          {" · "}
                          <a
                            href={r.citationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 hover:underline dark:text-brand-300"
                          >
                            source
                          </a>
                        </>
                      )}
                    </p>
                    {r.note && (
                      <p className="mt-1 text-xs text-ink-600 dark:text-ink-300">{r.note}</p>
                    )}
                    {peer && peer.total > 0 && (
                      <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                        ✓ {peer.agree} of {peer.total} other {rules.stateName} school
                        {peer.total === 1 ? "" : "s"} confirmed {r.target} {r.unit}
                        {r.target === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  <Field label={`State minimum (${r.unit}s)`}>
                    <TextInput
                      name={`stateMin.${r.key}`}
                      type="number"
                      min={0}
                      step="0.5"
                      inputMode="decimal"
                      defaultValue={answers?.stateMinimums[r.key] ?? r.target}
                    />
                  </Field>
                  <Field
                    label={`Your school's target (${r.unit}s)`}
                    hint={overridden ? `Pack says ${r.target}; you set ${eff?.target}.` : undefined}
                  >
                    <TextInput
                      name={`target.${r.key}`}
                      type="number"
                      min={0}
                      step="0.5"
                      inputMode="decimal"
                      defaultValue={answers?.schoolTargets[r.key] ?? eff?.target ?? r.target}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </Card>

        {cred && (
          <Card>
            <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              2 · Your permit-eligibility credential
            </h2>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              {cred.description ??
                "The document that proves a student finished classroom hours and can go for their permit."}
              {cred.formalName ? ` Officially: ${cred.formalName}.` : ""}
              {cred.submission?.instructions ? ` ${cred.submission.instructions}` : ""}
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="What your school calls it"
                hint={
                  rules.appliedKeys.includes(credentialLabelKey(cred.key))
                    ? `Pack says "${cred.label}".`
                    : undefined
                }
              >
                <TextInput
                  name="credential.label"
                  defaultValue={answers?.credential.label || effectiveCred?.label || cred.label}
                  maxLength={120}
                />
              </Field>
              <Field label="Who issues it?">
                <Select
                  name="credential.issuedBy"
                  defaultValue={answers?.credential.issuedBy || cred.issuedBy || "unknown"}
                >
                  {ISSUED_BY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="How do you submit completion to the state?">
                <Select
                  name="credential.submissionMethod"
                  defaultValue={
                    answers?.credential.submissionMethod || cred.submission?.method || "unknown"
                  }
                >
                  {SUBMISSION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Your state school license / provider number"
                hint={
                  pack.schoolLicensing?.agency
                    ? `Issued by ${pack.schoolLicensing.agency}. Printed on credentials we generate.`
                    : "Printed on credentials we generate for you."
                }
              >
                <TextInput
                  name="credential.licenseNumber"
                  defaultValue={answers?.credential.licenseNumber ?? ""}
                  maxLength={80}
                  autoComplete="off"
                />
              </Field>
              <Field label="Who signs it (name or title)">
                <TextInput
                  name="credential.signerTitle"
                  defaultValue={answers?.credential.signerTitle ?? ""}
                  placeholder="e.g. Owner / Chief Instructor"
                  maxLength={80}
                />
              </Field>
            </div>
          </Card>
        )}

        {openQuestions.length > 0 && (
          <Card>
            <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
              3 · Help us get {rules.stateName} right
            </h2>
            <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
              Things only a school operating in {rules.stateName} can answer. Skip any you're not
              sure about.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {openQuestions.map((q) => (
                <Field key={q.key} label={q.question} hint={q.whyItMatters}>
                  {q.kind === "choice" && q.choices?.length ? (
                    <Select name={`open.${q.key}`} defaultValue={answers?.openAnswers[q.key] ?? ""}>
                      <option value="">—</option>
                      {q.choices.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  ) : q.kind === "yes_no" ? (
                    <Select name={`open.${q.key}`} defaultValue={answers?.openAnswers[q.key] ?? ""}>
                      <option value="">—</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                      <option value="depends">It depends</option>
                    </Select>
                  ) : (
                    <TextInput
                      name={`open.${q.key}`}
                      type={q.kind === "number" ? "number" : "text"}
                      defaultValue={answers?.openAnswers[q.key] ?? ""}
                      maxLength={500}
                    />
                  )}
                </Field>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            {openQuestions.length > 0 ? "4" : "3"} · Anything else your school requires?
          </h2>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            A parent meeting, a vehicle-familiarization session, a written test before BTW —
            whatever's yours. We'll show it to families as part of "what happens next."
          </p>
          <div className="mt-3">
            <TextArea
              name="additionalRequirements"
              defaultValue={answers?.additionalRequirements ?? ""}
              maxLength={2000}
              placeholder="Optional"
            />
          </div>
          <label className="mt-4 flex items-start gap-3 text-sm text-ink-700 dark:text-ink-200">
            <input
              type="checkbox"
              name="confirmedAccurate"
              defaultChecked={answers?.confirmedAccurate ?? false}
              className="mt-1 h-4 w-4 rounded border-ink-300"
            />
            <span>
              I've checked the state minimums above against what {rules.stateName} currently
              requires of my school.
            </span>
          </label>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-200/60 pt-5 dark:border-ink-800/60">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save my school's rules"}
            </Button>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Saved to your school only. The master {rules.stateName} pack is never changed by a
              single school — corrections go to our research queue.
            </p>
          </div>
        </Card>
      </Form>

      {(pack.facts || pack.schoolLicensing || (pack.sources?.length ?? 0) > 0) && (
        <Card>
          <h2 className="text-sm font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
            What we know about {rules.stateName}
          </h2>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            {Object.entries(pack.facts ?? {})
              .filter(([k, v]) => k !== "notes" && (typeof v === "string" || typeof v === "number"))
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                    {humanizeKey(k)}
                  </dt>
                  <dd className="mt-0.5 text-ink-800 dark:text-ink-100">{String(v)}</dd>
                </div>
              ))}
            {pack.schoolLicensing?.agency && (
              <div>
                <dt className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  School licensing
                </dt>
                <dd className="mt-0.5 text-ink-800 dark:text-ink-100">
                  {pack.schoolLicensing.agency}
                  {pack.schoolLicensing.note ? ` — ${pack.schoolLicensing.note}` : ""}
                  {pack.schoolLicensing.lookupUrl && (
                    <>
                      {" "}
                      <a
                        href={pack.schoolLicensing.lookupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline dark:text-brand-300"
                      >
                        lookup
                      </a>
                    </>
                  )}
                </dd>
              </div>
            )}
          </dl>
          {(pack.sources?.length ?? 0) > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
                Sources
              </p>
              <ul className="mt-1 space-y-1 text-xs">
                {pack.sources!.slice(0, 8).map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 hover:underline dark:text-brand-300"
                    >
                      {s.title ?? s.url}
                    </a>
                    {s.note ? <span className="text-ink-500 dark:text-ink-400"> — {s.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function humanizeKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
