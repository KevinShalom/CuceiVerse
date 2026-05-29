import { NextResponse } from "next/server";
import { getSetsForType } from "../../../lib/figuredata";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") ?? "").trim();
    const gender = (url.searchParams.get("gender") ?? "U").toUpperCase() as any;
    if (!type) return NextResponse.json({ error: "missing type" }, { status: 400 });

    const sets = await getSetsForType(type, gender);
    return NextResponse.json({ sets }, { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "error" }, { status: 500 });
  }
}
