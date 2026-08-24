import { listRenders } from "@/lib/repo";

export const runtime = "nodejs";

/* GET /api/renders?projectId=... -> { renders: RenderDTO[] }
   Lists saved photorealistic renders — all, or scoped to one project. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const renders = await listRenders(projectId);
  return Response.json({ renders });
}
