import { NextResponse } from "next/server";
import { getFares } from "@/lib/fares/registry";

/**
 * Cheapest public one-way fare between airport groups on one date, for the "buy a confirmed seat"
 * backup. Returns an explicit failure (never an invented price) when no provider is connected.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const codes = (v: string | null) => (v ?? "").toUpperCase().split(",").map((x) => x.trim()).filter(Boolean);
  const result = await getFares({ from: codes(p.get("from")), to: codes(p.get("to")), date: p.get("date") ?? "", airline: (p.get("airline") ?? "AA").toUpperCase() });
  const status = result.ok ? 200 : result.reason === "invalid_request" ? 400 : result.reason === "rate_limited" ? 429 : 503;
  return NextResponse.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
