import type { Route } from "./+types/unsubscribe";
import { unsubscribeToken } from "~/lib/email-templates.server";

/**
 * One-click unsubscribe target for the digest emails (CAN-SPAM).
 *
 * Link: /unsubscribe?e=<email>&c=<category>&t=<hmac>. The token is an
 * HMAC of (email:category) with BETTER_AUTH_SECRET, so the link proves
 * itself — no stored token. A valid hit inserts an email_suppression
 * row; the digest senders skip anyone present for that category.
 *
 * Renders a tiny standalone confirmation page (no app shell — the
 * recipient isn't necessarily signed in).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const email = (url.searchParams.get("e") ?? "").trim().toLowerCase();
  const category = (url.searchParams.get("c") ?? "").trim();
  const token = (url.searchParams.get("t") ?? "").trim();

  let status: "done" | "invalid" | "already" = "invalid";
  if (email && category && token) {
    const expected = await unsubscribeToken(env, email, category);
    if (timingSafeEqualStr(token, expected)) {
      try {
        const res = await env.DB.prepare(
          "INSERT OR IGNORE INTO email_suppression (email, category, createdAt) VALUES (?, ?, ?)",
        )
          .bind(email, category, Date.now())
          .run();
        status = res.meta?.changes ? "done" : "already";
      } catch (err) {
        console.error("[unsubscribe] insert failed:", err);
        status = "done"; // don't reveal storage errors; treat as handled
      }
    }
  }

  return { status, email, category };
}

const LABELS: Record<string, string> = {
  digest: "digest emails",
};

export default function Unsubscribe({ loaderData }: Route.ComponentProps) {
  const { status, email, category } = loaderData;
  const what = LABELS[category] ?? "these emails";

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f3f4f6",
        fontFamily: "system-ui, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "440px",
          width: "100%",
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          padding: "28px",
          textAlign: "center",
        }}
      >
        <p style={{ fontWeight: 700, fontSize: "20px", color: "#1e3a8a", margin: "0 0 16px" }}>
          directio
        </p>
        {status === "done" || status === "already" ? (
          <>
            <h1 style={{ fontSize: "20px", color: "#0f172a", margin: "0 0 10px" }}>
              You're unsubscribed
            </h1>
            <p style={{ fontSize: "15px", lineHeight: 1.55, color: "#4b5563", margin: 0 }}>
              {email ? <strong>{email}</strong> : "You"} will no longer receive {what}.
              Transactional emails — receipts, enrollment confirmations, and the
              like — still come through, since they're not marketing.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: "20px", color: "#0f172a", margin: "0 0 10px" }}>
              This link isn't valid
            </h1>
            <p style={{ fontSize: "15px", lineHeight: 1.55, color: "#4b5563", margin: 0 }}>
              The unsubscribe link may have expired or been altered. You can turn
              off digests anytime from Settings → Notifications, or email{" "}
              <a href="mailto:support@godirectio.com" style={{ color: "#1e3a8a" }}>
                support@godirectio.com
              </a>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
