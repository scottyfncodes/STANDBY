import { getAirport } from "@/lib/data/airports";
import { isISODate } from "@/lib/engine/time";
import { TtlCache } from "@/lib/flightdata/cache";
import { createSerpApiFares, serpApiConfigFromEnv } from "./serpapi";
import type { FareQuery, FareResult } from "./types";

/** Server-only. SerpApi (Google Flights) is active when SERPAPI_API_KEY is set. */
export interface FareProvider {
  label: string;
  quote(q: FareQuery): Promise<FareResult>;
}

export function configuredFareProvider(env: Record<string, string | undefined> = process.env): FareProvider | undefined {
  const cfg = serpApiConfigFromEnv(env);
  return cfg ? createSerpApiFares(cfg) : undefined;
}

export function validateFares(q: Partial<FareQuery>): string | undefined {
  const ok = (codes?: string[]) => !!codes?.length && codes.length <= 4 && codes.every((c) => !!getAirport(c));
  if (!ok(q.from)) return "Unknown origin airport";
  if (!ok(q.to)) return "Unknown destination airport";
  if (!isISODate(q.date)) return "Invalid date";
  if (!q.airline || !/^[A-Z0-9]{2}$/.test(q.airline)) return "Invalid airline";
  return undefined;
}

// Successful quotes only; failures are retried on the next request.
const cache = new TtlCache<FareResult>(30 * 60_000);
let provider: FareProvider | null | undefined;

export async function getFares(q: FareQuery, p: FareProvider | undefined = (provider ??= configuredFareProvider() ?? null) ?? undefined): Promise<FareResult> {
  const invalid = validateFares(q);
  if (invalid) return { ok: false, reason: "invalid_request", detail: invalid };
  if (!p) return { ok: false, reason: "not_configured", detail: "No fare provider is connected (SerpApi needs an API key)." };
  const key = `${q.from.join(",")}>${q.to.join(",")}:${q.date}:${q.airline}`;
  const hit = cache.get(key);
  if (hit?.ok) return { ...hit, cached: true };
  let res: FareResult;
  try {
    res = await p.quote(q);
  } catch (e) {
    res = { ok: false, reason: "unavailable", detail: `${p.label}: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (res.ok) cache.set(key, res);
  return res;
}
