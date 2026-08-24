import { NextResponse } from "next/server";
import { saveFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generic upload endpoint used by the project photo step and the Phase 2
// vendor video upload. Accepts multipart/form-data with `file` and `folder`.
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const folder = (form.get("folder") as string) || "misc";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { key, url } = await saveFile(buffer, {
      folder,
      filename: file.name,
    });

    return NextResponse.json({ key, url }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
