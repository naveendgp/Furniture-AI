import { NextResponse } from "next/server";
import { listProjects, createProject } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await listProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.name || !body?.photoUrl) {
      return NextResponse.json(
        { error: "name and photoUrl are required" },
        { status: 400 },
      );
    }
    const project = await createProject({
      name: body.name,
      roomType: body.roomType ?? "Room",
      style: body.style ?? "Modern",
      photoUrl: body.photoUrl,
      thumbnailUrl: body.thumbnailUrl,
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create project" },
      { status: 500 },
    );
  }
}
