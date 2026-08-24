import { estimateFurnitureScale, GeminiQuotaError } from "@/lib/gemini";

export const runtime = "nodejs";

/* POST { image: dataURL } -> { scaleMultiplier }
   Asks Gemini whether the placed furniture is realistically sized and returns a
   multiplier to apply to the global furniture scale. */
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
  if (!match) return Response.json({ error: "unsupported image" }, { status: 400 });
  const [, mime, b64] = match;

  try {
    const scaleMultiplier = await estimateFurnitureScale(Buffer.from(b64, "base64"), mime);
    return Response.json({ scaleMultiplier });
  } catch (err) {
    if (err instanceof GeminiQuotaError) {
      return Response.json({ error: err.message, code: "quota" }, { status: 402 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "scale estimate failed" },
      { status: 502 },
    );
  }
}
