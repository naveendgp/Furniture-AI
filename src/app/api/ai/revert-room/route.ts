import { revertProjectPhoto } from "@/lib/repo";

export const runtime = "nodejs";

/* POST { projectId } -> { photoUrl }  — restore the project's original room photo. */
export async function POST(req: Request) {
  let projectId: string | undefined;
  try {
    ({ projectId } = await req.json());
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });
  const photoUrl = await revertProjectPhoto(projectId);
  if (!photoUrl) return Response.json({ error: "project not found" }, { status: 404 });
  return Response.json({ photoUrl });
}
