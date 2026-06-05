import { data } from "react-router";
import type { Route } from "./+types/api.lesson.translate";
import { requireTenant } from "~/lib/tenant.server";
import { recordAudit } from "~/lib/audit.server";
import {
  InsufficientCreditsError,
  TIER_PRICE_CENTS,
  TranslationConfigError,
  TranslationVendorError,
  getCreditBalanceCents,
  translateLesson,
  type TranslationTier,
} from "~/lib/translation.server";

/**
 * Translate a school lesson into a target language.
 *
 *  POST /api/lesson/translate
 *  body: form data with `schoolLessonId`, `targetLang`
 *
 * Authn: tenant member of the lesson's org with edit-curriculum
 * privileges (owner / admin). Demo orgs allowed.
 *
 * Charges TRANSLATION_PRICE_CENTS (50¢) against the org's credit
 * balance. On insufficient credit, returns 402 with a clear top-up
 * CTA. On vendor failure, returns 502 without charging.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const tenant = await requireTenant(request, env);
  if (
    tenant.role !== "owner" &&
    tenant.role !== "admin" &&
    !tenant.organization.isDemo
  ) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const schoolLessonId = String(form.get("schoolLessonId") ?? "").trim();
  const targetLang = String(form.get("targetLang") ?? "").trim().toLowerCase();
  const rawTier = String(form.get("tier") ?? "standard").trim().toLowerCase();
  const tier: TranslationTier = rawTier === "premium" ? "premium" : "standard";
  if (!schoolLessonId || !targetLang) {
    return data({ error: "Missing schoolLessonId or targetLang" }, { status: 400 });
  }

  try {
    const result = await translateLesson(env, {
      organizationId: tenant.organization.id,
      schoolLessonId,
      targetLang,
      requestedByUserId: tenant.user.id,
      tier,
    });

    const newBalance = await getCreditBalanceCents(env, tenant.organization.id);
    const chargedCents = TIER_PRICE_CENTS[result.tier];

    await recordAudit(env, {
      organizationId: tenant.organization.id,
      actorUserId: tenant.user.id,
      action: "lesson.translated",
      entityType: "school_lesson",
      entityId: schoolLessonId,
      payload: {
        targetLang,
        vendor: result.vendor,
        tier: result.tier,
        fromCache: result.fromCache,
        translationId: result.translationId,
        chargedCents,
      },
    });

    return data({
      ok: true,
      translationId: result.translationId,
      vendor: result.vendor,
      tier: result.tier,
      fromCache: result.fromCache,
      targetLang,
      translatedTitle: result.translatedTitle,
      translatedBody: result.translatedBody,
      translatedScript: result.translatedScript,
      chargedCents,
      balanceCents: newBalance,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return data(
        {
          error: "insufficient_credits",
          balanceCents: err.balanceCents,
          requiredCents: err.requiredCents,
          message:
            "Not enough translation credits. Top up to keep translating.",
        },
        { status: 402 },
      );
    }
    if (err instanceof TranslationConfigError) {
      // Operator-facing: a vendor key is missing. Don't charge.
      console.error("[translate] config error:", err.message);
      return data(
        {
          error: "vendor_config",
          message:
            "Translation is temporarily unavailable. Try again in a few minutes.",
        },
        { status: 503 },
      );
    }
    if (err instanceof TranslationVendorError) {
      console.error("[translate] vendor error:", err.message);
      return data(
        {
          error: "vendor_failed",
          message:
            "Translation failed and no charge was applied. Try again, or pick a different language.",
        },
        { status: 502 },
      );
    }
    console.error("[translate] unexpected:", err);
    return data({ error: "unexpected" }, { status: 500 });
  }
}

export function loader() {
  return data({ error: "POST only" }, { status: 405 });
}
