import { getCloudLiveness } from "@/modules/cloud/health";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const result = getCloudLiveness();
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
