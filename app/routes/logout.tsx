import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { getAuth } from "~/lib/auth.server";

export async function action({ request, context }: Route.ActionArgs) {
  const auth = getAuth(context.cloudflare.env);
  const response = await auth.api.signOut({
    headers: request.headers,
    asResponse: true,
  });
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") headers.append("Set-Cookie", value);
  });
  return redirect("/", { headers });
}

export async function loader() {
  return redirect("/");
}
