import { analyzeRoom, GeminiQuotaError } from "@/lib/gemini";

export const runtime = "nodejs";

/* POST { image: dataURL } -> { objects: FloorObject[] }
   `image` is the photo-only stage view (captured client-side) so detected boxes are
   in the same coordinate space as placement anchors. Run once per room, cached. */
export async function POST(req: Request) {
  let image: string | undefined;
  try {
    ({ image } = await req.json());
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }
  if (!image || typeof image !== "string" || !image.startsWith("data:")) {
    return Response.json({ error: "image data URL required" }, { status: 400 });
  }
  const match = image.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) {
    return Response.json({ error: "unsupported image encoding" }, { status: 400 });
  }
  const [, mime, b64] = match;
  const buffer = Buffer.from(b64, "base64");

  try {
    const analysis = await analyzeRoom(buffer, mime);
    return Response.json(analysis);
  } catch (err) {
    if (err instanceof GeminiQuotaError) {
      return Response.json({ error: err.message, code: "quota" }, { status: 402 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "segmentation failed" },
      { status: 502 },
    );
  }
}
