/**
 * After the batched org seed lands, copy the platform's national-teen-core
 * classroom curriculum into the demo org's `school_*` tables so the demo
 * student actually has lessons to read on /me/learn.
 *
 * Runs AFTER `env.DB.batch()` because `deepCopyPackToSchool` performs its
 * own multi-statement work and must observe the school_pack_install row.
 * Failures are logged but do not abort the seed — a demo org with zero
 * lessons is still better than no demo org.
 */

import { newId } from "../ids";

export async function installNationalCorePack(
  env: Env,
  orgId: string,
  now: number,
): Promise<void> {
  try {
    // Pin to the classroom curriculum (40 lessons including "Reading
    // traffic signs" with inline sign shortcodes) — not the BTW
    // progression pack, which is also national-scope but is for the
    // in-car lesson sequence.
    const nationalVersion = await env.DB.prepare(
      `SELECT cpv.id AS versionId
         FROM content_pack cp
         JOIN content_pack_version cpv ON cpv.contentPackId = cp.id
        WHERE cp.slug = 'national-teen-core' AND cpv.publishedAt IS NOT NULL
        ORDER BY cpv.publishedAt DESC
        LIMIT 1`,
    ).first<{ versionId: string }>();
    if (nationalVersion?.versionId) {
      const installId = newId();
      await env.DB.prepare(
        `INSERT INTO school_pack_install (id, organizationId, contentPackVersionId, installedAt)
         VALUES (?, ?, ?, ?)`,
      )
        .bind(installId, orgId, nationalVersion.versionId, now)
        .run();
      const { deepCopyPackToSchool } = await import("../curriculum.server");
      await deepCopyPackToSchool(env, {
        organizationId: orgId,
        schoolPackInstallId: installId,
        contentPackVersionId: nationalVersion.versionId,
      });
      // Publish every copied lesson so the student-side view sees them.
      await env.DB.prepare(
        "UPDATE school_lesson SET published = 1, updatedAt = ? WHERE organizationId = ?",
      )
        .bind(now, orgId)
        .run();
    }
  } catch (err) {
    console.warn("[demo-seeder] curriculum install failed:", err);
  }
}
