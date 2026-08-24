import { readFile } from "@/lib/storage";
import { lightingInsight, GeminiQuotaError } from "@/lib/gemini";

export const runtime = "nodejs";

/* POST { photoUrl, installed } -> { sufficient, recommended, insight }
   Uses the ORIGINAL room photo (not a screenshot with the lights already in it) so
   the recommended total stays stable and the deficit shrinks as lights are added. */
export async function POST(req: Request) {
  let payload: { photoUrl?: string; installed?: number };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { photoUrl, installed } = payload;
  if (!photoUrl || typeof photoUrl !== "string") {
    return Response.json({ error: "photoUrl required" }, { status: 400 });
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
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  try {
    const result = await lightingInsight(buffer, mime, Math.max(0, Number(installed) || 0));
    return Response.json(result);
  } catch (err) {
    if (err instanceof GeminiQuotaError) {
      return Response.json({ error: err.message, code: "quota" }, { status: 402 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "insight failed" },
      { status: 502 },
    );
  }
}
