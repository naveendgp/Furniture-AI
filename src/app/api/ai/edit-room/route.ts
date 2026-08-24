import { readFile, saveFile } from "@/lib/storage";
import { editRoomImage, GeminiQuotaError } from "@/lib/gemini";
import { updateProjectPhoto } from "@/lib/repo";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/* POST { projectId, photoUrl, instruction } -> { photoUrl }
   Edits the room's base photo per a natural-language instruction (wallpaper, curtains,
   paint, flooring…), saves the new image, sets it as the project's photo, and returns
   the new url. Furniture (a 3D overlay) is unaffected. */
export async function POST(req: Request) {
  let projectId: string | undefined;
  let photoUrl: string | undefined;
  let instruction: string | undefined;
  try {
    ({ projectId, photoUrl, instruction } = await req.json());
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!projectId || !photoUrl || !instruction || instruction.trim().length < 2) {
    return Response.json({ error: "projectId, photoUrl and instruction required" }, { status: 400 });
  }

  const marker = "/api/files/";
  const idx = photoUrl.indexOf(marker);
  if (idx === -1) {
    return Response.json({ error: "unsupported photoUrl" }, { status: 400 });
  }
  const key = photoUrl.slice(idx + marker.length).split("?")[0];
  const buffer = await readFile(key);
  if (!buffer) {
    return Response.json({ error: "photo not found" }, { status: 404 });
  }
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const mime = MIME[ext] ?? "image/jpeg";

  try {
    const out = await editRoomImage(buffer, mime, instruction.trim());
    const outExt = out.mimeType.includes("jpeg") ? ".jpg" : out.mimeType.includes("webp") ? ".webp" : ".png";
    const saved = await saveFile(out.data, { folder: "rooms", ext: outExt });
    await updateProjectPhoto(projectId, saved.url);
    return Response.json({ photoUrl: saved.url });
  } catch (err) {
    if (err instanceof GeminiQuotaError) {
      return Response.json({ error: err.message, code: "billing" }, { status: 402 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "room edit failed" },
      { status: 502 },
    );
  }
}
