import { placeItem, GeminiQuotaError, type ItemToPlace, type PlacedSummary } from "@/lib/gemini";

export const runtime = "nodejs";

/* POST { image: dataURL, item, placed[] } -> PlacementPlan
   `image` is a screenshot of the room WITH current furniture (composited on the
   client) so Gemini can see real occupancy, judge free space, and choose a facing
   angle. Returns { fits, reason, ax, ay, facingDeg, confidence }. */
export async function POST(req: Request) {
  let payload: { image?: string; item?: ItemToPlace; placed?: PlacedSummary[] };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { image, item, placed } = payload;
  if (!image || typeof image !== "string" || !image.startsWith("data:")) {
    return Response.json({ error: "image data URL required" }, { status: 400 });
  }
  if (!item || typeof item.name !== "string") {
    return Response.json({ error: "item required" }, { status: 400 });
  }

  const match = image.match(/^data:(image\/\w+);base64,(.+)$/s);
  if (!match) {
    return Response.json({ error: "unsupported image encoding" }, { status: 400 });
  }
  const [, mime, b64] = match;
  const buffer = Buffer.from(b64, "base64");

  try {
    const plan = await placeItem(buffer, mime, item, Array.isArray(placed) ? placed : []);
    return Response.json(plan);
  } catch (err) {
    if (err instanceof GeminiQuotaError) {
      return Response.json({ error: err.message, code: "quota" }, { status: 402 });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "placement failed" },
      { status: 502 },
    );
  }
}
