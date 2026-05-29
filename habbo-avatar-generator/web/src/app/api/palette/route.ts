import { NextResponse } from "next/server";
import { getPaletteColors } from "../../../lib/figuredata";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id") ?? "0");
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    const colors = await getPaletteColors(id);
    return NextResponse.json({ colors }, { headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "error" }, { status: 500 });
  }
}
