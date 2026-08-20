import { getLiveness } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET(): Response {
  const result = getLiveness();
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
