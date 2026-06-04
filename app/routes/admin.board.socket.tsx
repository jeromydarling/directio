import type { Route } from "./+types/admin.board.socket";
import { requireTenant } from "~/lib/tenant.server";

/**
 * WebSocket upgrade endpoint for the live scheduling board. Auth happens
 * here (requireTenant must succeed; admin or owner role required), then
 * we forward the upgrade to this org's SchedulingBoard Durable Object.
 *
 * The client opens this URL from /admin/schedule/board.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    return new Response("forbidden", { status: 403 });
  }
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("expected websocket upgrade", { status: 426 });
  }
  const env = context.cloudflare.env;
  const id = env.SCHEDULING_BOARD.idFromName(tenant.organization.id);
  const stub = env.SCHEDULING_BOARD.get(id);
  return stub.fetch(request);
}
