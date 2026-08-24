import { NextResponse } from "next/server";
import { getBudget } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const budget = await getBudget(searchParams.get("projectId") ?? undefined);
  if (!budget) {
    return NextResponse.json({ error: "No project found" }, { status: 404 });
  }
  return NextResponse.json({ budget });
}
