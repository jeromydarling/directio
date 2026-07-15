import { betterAuth } from "better-auth";
import { magicLink, organization } from "better-auth/plugins";
import { D1Dialect } from "kysely-d1";
import { isEmailConfigured, sendEmail } from "./email.server";

// Cache the auth instance per Worker isolate. The D1 binding is stable
// for the lifetime of the isolate, so we can safely memoize.
let _auth: ReturnType<typeof createAuth> | null = null;

function createAuth(env: Env) {
  const isProd = env.APP_ENV === "production";
  return betterAuth({
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: "sqlite",
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    // Reject cross-site form posts to auth endpoints: only our own
    // origin may drive sign-in/sign-up.
    trustedOrigins: [env.APP_URL],
    advanced: {
      useSecureCookies: isProd,
    },
    emailAndPassword: {
      // Password is supported but never required. Per spec #6: passwordless
      // is a permanent lifecycle, not a temporary state. Parents may
      // complete enrollment without ever choosing one.
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    plugins: [
      organization(),
      magicLink({
        // Magic links are bearer credentials — 15 minutes is the
        // industry ceiling. The email says "sign in now", not "save
        // this for later".
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          if (!isEmailConfigured(env)) {
            if (isProd) {
              // NEVER log the URL in prod — a magic-link URL in the
              // observability pipeline is a leaked credential.
              console.error(
                "[magic-link] EMAIL binding missing in production; link not delivered",
              );
              return;
            }
            // Dev without the email binding: the console line is how
            // the developer gets the link.
            console.log(`[magic-link] ${email} → ${url}`);
            return;
          }
          await sendEmail(env, {
            to: email,
            subject: "Your directio sign-in link",
            html: magicLinkHtml(url),
            text: magicLinkText(url),
          });
        },
      }),
    ],
  });
}

export function getAuth(env: Env) {
  if (!_auth) _auth = createAuth(env);
  return _auth;
}

export type Auth = ReturnType<typeof getAuth>;

/**
 * Server-generated throwaway password. Used during guest checkout to
 * satisfy Better Auth's signUpEmail without showing a password screen
 * to the parent. They never see this; they sign in via magic-link
 * (or set a real password later if they want).
 */
export function generateClaimPendingPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += b.toString(36).padStart(2, "0");
  return s.slice(0, 40);
}

function magicLinkHtml(url: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;max-width:520px;margin:24px auto;padding:0 16px">
  <h2 style="font-size:20px;margin:0 0 12px">Your directio sign-in link</h2>
  <p>Click the button below to sign in. The link works for 15 minutes.</p>
  <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1e3a8a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Open my portal</a></p>
  <p style="font-size:13px;color:#555">If the button doesn't work, paste this URL into your browser:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>
  <p style="font-size:12px;color:#888;margin-top:32px">If you didn't request this, you can safely ignore it.</p>
</body></html>`;
}

function magicLinkText(url: string): string {
  return `Your directio sign-in link\n\nOpen this URL within the next 15 minutes to sign in:\n${url}\n\nIf you didn't request this, you can safely ignore it.\n`;
}

function escapeHtml(s: string): string {
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
