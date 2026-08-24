import { NextResponse } from "next/server";
import { addPlacement } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { productId } = await req.json();
    if (!productId) {
      return NextResponse.json({ error: "productId required" }, { status: 400 });
    }
    const placement = await addPlacement(id, productId);
    return NextResponse.json({ placement }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add item" },
      { status: 500 },
    );
  }
}
