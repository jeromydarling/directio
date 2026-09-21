/**
 * Cron-driven state-rule change monitor.
 *
 * Each hour, we fetch a small batch of tracked state DMV pages, hash
 * the text, compare to the prior hash, and — if it changed — ask the
 * cheap Workers AI llama-3.1-8b model whether the diff is material.
 * Material changes raise a state_change_alert row for admin review;
 * minor changes update the hash silently.
 *
 * This is intentionally cheap: ~$0 in API costs for the classification
 * (Workers AI is free at this volume), Anthropic only invoked when an
 * admin triggers a full re-audit from the alert.
 */

import { newId } from "./ids";
import { fetchStatePage } from "./state-audit.server";
import { workersAiPrompt } from "./llm.server";

const MONITOR_SYSTEM = `You are a regulatory monitor. You compare two snapshots
of a U.S. state DMV web page and decide whether the change is material
for teen driver education — meaning a real change to credential
requirements, hour minimums, age minimums, fees, restrictions, or
forms. Cosmetic edits, typo fixes, banner updates, and copy tweaks
are NOT material. Respond ONLY with one of: MATERIAL, MAYBE_MATERIAL,
MINOR.`;

export async function runStateChangeMonitor(
  env: Env,
  args: { batchSize: number; now?: number },
): Promise<{ checked: number; changed: number; alerts: number; errors: number }> {
  const now = args.now ?? Date.now();
  // Round-robin: pick the N least-recently-fetched active pages.
  const pages = await env.DB.prepare(
    `SELECT id, stateCode, url, lastFetchedAt, lastContentHash
       FROM state_source_page
      WHERE active = 1
      ORDER BY COALESCE(lastFetchedAt, 0) ASC
      LIMIT ?`,
  )
    .bind(args.batchSize)
    .all<{
      id: string;
      stateCode: string;
      url: string;
      lastFetchedAt: number | null;
      lastContentHash: string | null;
    }>();

  let checked = 0;
  let changed = 0;
  let alerts = 0;
  let errors = 0;

  for (const p of pages.results) {
    checked++;
    try {
      const page = await fetchStatePage(env, p.url);
      const isChanged = p.lastContentHash !== null && p.lastContentHash !== page.hash;

      if (isChanged) {
        changed++;
        // Compare against the last snapshot we stored, not just a hash:
        // the classifier can't tell "the fee changed" from "the page
        // has a live clock" without seeing both versions.
        const oldText = await loadLastSnapshot(env, p.stateCode, p.id);
        const verdict = await classifyChange(env, {
          stateCode: p.stateCode,
          url: p.url,
          oldText: oldText?.slice(0, 3500) ?? "",
          newText: page.text.slice(0, 3500),
        });
        if (verdict.severity !== "minor") {
          // One pending alert per page. Dynamic pages (session ids,
          // "last updated" clocks) re-hash every fetch; without this
          // they generate an alert an hour, forever — we hit 1,300+.
          const existing = await env.DB.prepare(
            "SELECT id, severity FROM state_change_alert WHERE sourcePageId = ? AND status = 'pending' LIMIT 1",
          )
            .bind(p.id)
            .first<{ id: string; severity: string }>();
          if (existing) {
            const severity =
              existing.severity === "material" || verdict.severity === "material"
                ? "material"
                : "maybe_material";
            await env.DB.prepare(
              `UPDATE state_change_alert
                  SET detectedAt = ?, severity = ?, summary = ?, diffPreview = ?, modelUsed = ?
                WHERE id = ?`,
            )
              .bind(now, severity, verdict.summary, page.text.slice(0, 2000), verdict.modelUsed, existing.id)
              .run();
          } else {
            alerts++;
            await env.DB.prepare(
              `INSERT INTO state_change_alert
                 (id, stateCode, sourcePageId, detectedAt, severity, summary, diffPreview, modelUsed, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            )
              .bind(
                newId(),
                p.stateCode,
                p.id,
                now,
                verdict.severity,
                verdict.summary,
                page.text.slice(0, 2000),
                verdict.modelUsed,
              )
              .run();
          }
        }
        // Snapshot to R2 for later comparison
        if (env.ASSETS) {
          const snapshotKey = `state-snapshots/${p.stateCode}/${p.id}/${now}.txt`;
          try {
            await env.ASSETS.put(snapshotKey, page.text);
          } catch {
            // snapshot failure shouldn't kill the monitor
          }
        }
      }

      await env.DB.prepare(
        `UPDATE state_source_page
            SET lastFetchedAt = ?, lastContentHash = ?, lastError = NULL, updatedAt = ?
          WHERE id = ?`,
      )
        .bind(now, page.hash, now, p.id)
        .run();
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : "fetch failed";
      await env.DB.prepare(
        `UPDATE state_source_page
            SET lastFetchedAt = ?, lastError = ?, updatedAt = ?
          WHERE id = ?`,
      )
        .bind(now, message.slice(0, 400), now, p.id)
        .run();
    }
  }

  return { checked, changed, alerts, errors };
}

/**
 * Most recent R2 snapshot text for a page (keys are
 * state-snapshots/<state>/<pageId>/<epochMs>.txt, so lexical order is
 * chronological). Null when none exists or R2 isn't bound.
 */
async function loadLastSnapshot(env: Env, stateCode: string, pageId: string): Promise<string | null> {
  if (!env.ASSETS) return null;
  try {
    const prefix = `state-snapshots/${stateCode}/${pageId}/`;
    const listed = await env.ASSETS.list({ prefix, limit: 1000 });
    const last = listed.objects.map((o) => o.key).sort().at(-1);
    if (!last) return null;
    const obj = await env.ASSETS.get(last);
    return obj ? await obj.text() : null;
  } catch {
    return null;
  }
}

async function classifyChange(
  env: Env,
  args: { stateCode: string; url: string; oldText: string; newText: string },
): Promise<{ severity: "material" | "maybe_material" | "minor"; summary: string; modelUsed: string }> {
  const prompt = `State: ${args.stateCode}
Page URL: ${args.url}

PREVIOUS version of the page (excerpt):
"""
${args.oldText || "(no previous snapshot available — judge the new text on its own, and lean MINOR unless it clearly states a requirement change)"}
"""

NEW version of the page (excerpt):
"""
${args.newText}
"""

Compare the two. Dates, "last updated" stamps, session tokens, navigation, banners, and wording tweaks are MINOR. Only a change to hours, ages, fees, forms, restrictions, or who may provide instruction is MATERIAL.
Decide: MATERIAL, MAYBE_MATERIAL, or MINOR.
Then on a new line, give a one-sentence summary of what appears to have changed.

Format your reply exactly as:
VERDICT: <one of MATERIAL, MAYBE_MATERIAL, MINOR>
SUMMARY: <one sentence>`;

  try {
    const res = await workersAiPrompt(env, {
      system: MONITOR_SYSTEM,
      prompt,
      maxTokens: 200,
    });
    const verdict = parseVerdict(res.text);
    const summary = parseSummary(res.text);
    return { severity: verdict, summary, modelUsed: res.modelUsed };
  } catch {
    // If classification fails, flag conservatively
    return {
      severity: "maybe_material",
      summary: "Classification model unavailable; flagged for manual review.",
      modelUsed: "fallback",
    };
  }
}

function parseVerdict(text: string): "material" | "maybe_material" | "minor" {
  const m = text.match(/VERDICT:\s*(MATERIAL|MAYBE_MATERIAL|MINOR)/i);
  if (!m) return "maybe_material";
  return m[1].toLowerCase() as "material" | "maybe_material" | "minor";
}

function parseSummary(text: string): string {
  const m = text.match(/SUMMARY:\s*(.+?)(?:\n|$)/i);
  return m ? m[1].trim().slice(0, 400) : "Change detected.";
}
