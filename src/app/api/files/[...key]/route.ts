import { readFile } from "@/lib/storage";

export const runtime = "nodejs";

const MIME: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const joined = key.join("/");
  const buffer = await readFile(joined);
  if (!buffer) return new Response("Not found", { status: 404 });

  const ext = joined.slice(joined.lastIndexOf(".")).toLowerCase();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
