import type { Route } from "./+types/admin.vehicles.$vehicleId.photo[.jpg]";
import { requireTenant } from "~/lib/tenant.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const tenant = await requireTenant(request, context.cloudflare.env);
  if (tenant.role !== "owner" && tenant.role !== "admin") {
    return new Response("forbidden", { status: 403 });
  }
  const env = context.cloudflare.env;
  const vehicle = await env.DB.prepare(
    "SELECT photoKey FROM vehicle WHERE id = ? AND organizationId = ?",
  )
    .bind(params.vehicleId, tenant.organization.id)
    .first<{ photoKey: string | null }>();
  if (!vehicle?.photoKey) return new Response("no photo", { status: 404 });
  const obj = await env.ASSETS.get(vehicle.photoKey);
  if (!obj) return new Response("file missing", { status: 410 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
