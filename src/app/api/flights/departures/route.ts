import { NextResponse } from "next/server";
import { getDepartures } from "@/lib/flightdata/registry";

/**
 * Live departures through the provider-independent flight-data layer.
 * Returns an explicit failure (never invented flights) when no provider is connected.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const result = await getDepartures({
    airport: (p.get("airport") ?? "").toUpperCase(),
    to: p.get("to")?.toUpperCase() || undefined,
    date: p.get("date") ?? "",
    carrier: (p.get("carrier") ?? "AA").toUpperCase(),
  });
  const status = result.ok ? 200 : result.reason === "invalid_request" ? 400 : result.reason === "rate_limited" ? 429 : 503;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
