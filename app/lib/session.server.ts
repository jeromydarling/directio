import { redirect } from "react-router";
import { getAuth } from "./auth.server";

export async function getSession(request: Request, env: Env) {
  const auth = getAuth(env);
  return auth.api.getSession({ headers: request.headers });
}

export async function requireUser(request: Request, env: Env) {
  const session = await getSession(request, env);
  if (!session?.user) {
    const url = new URL(request.url);
    throw redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return session;
}
