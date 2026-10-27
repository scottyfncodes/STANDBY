import { NextResponse } from "next/server";
import { getAirport } from "@/lib/data/airports";
import { fetchClimate } from "@/lib/providers/climate";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("airport")?.toUpperCase() ?? "";
  const airport = getAirport(code);
  if (!airport) return NextResponse.json({ error: "Unknown airport" }, { status: 404 });
  try {
    const data = await fetchClimate(airport);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400" } });
  } catch (e) {
    return NextResponse.json({ error: "Climate provider unavailable", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
