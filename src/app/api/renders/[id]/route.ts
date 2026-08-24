import { deleteRender } from "@/lib/repo";
import { deleteFile } from "@/lib/storage";

export const runtime = "nodejs";

/* DELETE /api/renders/[id] — remove a render from the gallery + its image files. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const removed = await deleteRender(id);
  if (removed) {
    await deleteFile(removed.beforeUrl);
    await deleteFile(removed.afterUrl);
  }
  return Response.json({ ok: true });
}
