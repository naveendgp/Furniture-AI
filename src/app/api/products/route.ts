import { NextResponse } from "next/server";
import { listProducts, createProduct } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const products = await listProducts({
    q: searchParams.get("q") ?? undefined,
    style: searchParams.get("style") ?? undefined,
  });
  return NextResponse.json({ products });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.name || !body?.category || body?.priceInr == null) {
      return NextResponse.json(
        { error: "name, category and priceInr are required" },
        { status: 400 },
      );
    }
    const product = await createProduct(body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create product" },
      { status: 500 },
    );
  }
}
