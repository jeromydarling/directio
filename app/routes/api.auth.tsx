import type { Route } from "./+types/api.auth";
import { getAuth } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  return getAuth(context.cloudflare.env).handler(request);
}

export async function action({ request, context }: Route.ActionArgs) {
  return getAuth(context.cloudflare.env).handler(request);
}
