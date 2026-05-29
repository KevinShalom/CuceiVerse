import { NextResponse } from "next/server";
import { getSetTypes } from "../../../lib/figuredata";

export async function GET() {
  try {
    const setTypes = await getSetTypes();
    return NextResponse.json({ setTypes }, { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=3600" } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "error" }, { status: 500 });
  }
}
