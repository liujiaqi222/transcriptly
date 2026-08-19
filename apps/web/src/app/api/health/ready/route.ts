import { getCloudReadiness } from "@/modules/cloud/health";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await getCloudReadiness();
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
