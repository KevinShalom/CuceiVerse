import { NextResponse } from "next/server";

// Proxies to Nitro Imager (internal service)
export async function GET(req: Request) {
  const imager = process.env.IMAGER_INTERNAL_URL || "";
  if (!imager) {
    return NextResponse.json({ error: "IMAGER_INTERNAL_URL no configurado" }, { status: 500 });
  }

  const url = new URL(req.url);
  const qs = url.searchParams;

  const target = new URL(imager);
  // Pass-through known params
  for (const [k, v] of qs.entries()) {
    target.searchParams.set(k, v);
  }

  // Safe defaults
  if (!target.searchParams.get("img_format")) target.searchParams.set("img_format", "png");
  if (!target.searchParams.get("size")) target.searchParams.set("size", "n");
  if (!target.searchParams.get("direction")) target.searchParams.set("direction", "2");
  if (!target.searchParams.get("head_direction")) target.searchParams.set("head_direction", target.searchParams.get("direction")!);

  const res = await fetch(target.toString(), {
    // Disable cache to prevent ghost items/stale renders
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: "imager_error", status: res.status, detail: text.slice(0, 400) }, { status: 502 });
  }

  const contentType = res.headers.get("content-type") || "image/png";
  const buf = await res.arrayBuffer();

  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
