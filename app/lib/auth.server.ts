import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { D1Dialect } from "kysely-d1";

// Cache the auth instance per Worker isolate. The D1 binding is stable
// for the lifetime of the isolate, so we can safely memoize.
let _auth: ReturnType<typeof createAuth> | null = null;

function createAuth(env: Env) {
  return betterAuth({
    database: {
      dialect: new D1Dialect({ database: env.DB }),
      type: "sqlite",
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    plugins: [organization()],
  });
}

export function getAuth(env: Env) {
  if (!_auth) _auth = createAuth(env);
  return _auth;
}

export type Auth = ReturnType<typeof getAuth>;
