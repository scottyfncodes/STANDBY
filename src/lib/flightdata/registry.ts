import { getAirport } from "@/lib/data/airports";
import { isISODate } from "@/lib/engine/time";
import { adbConfigFromEnv, createAeroDataBox } from "./aerodatabox";
import { TtlCache } from "./cache";
import type { DeparturesQuery, FlightDataProvider, NormalizedFlight, ProviderResult } from "./types";

/**
 * Server-only registry of live flight-data providers. AeroDataBox is active when
 * AERODATABOX_API_KEY is set; otherwise every request gets an explicit `not_configured`.
 */
export function configuredProviders(env: Record<string, string | undefined> = process.env): FlightDataProvider[] {
  const adb = adbConfigFromEnv(env);
  if (adb) return [createAeroDataBox(adb)];
  return [
    {
      id: "aerodatabox",
      label: "AeroDataBox",
      capabilities: ["schedules", "status"],
      configured: () => false,
    },
  ];
}

// Short in-memory cache per server instance; the adapter's fetch cache handles the longer horizon.
const cache = new TtlCache<ProviderResult<NormalizedFlight[]>>(5 * 60_000);

export function validateDepartures(q: Partial<DeparturesQuery>): string | undefined {
  if (!q.airport || !getAirport(q.airport)) return "Unknown airport";
  if (q.to && !getAirport(q.to)) return "Unknown destination";
  if (!isISODate(q.date)) return "Invalid date";
  if (!q.carrier || !/^[A-Z0-9]{2}$/.test(q.carrier)) return "Invalid carrier";
  return undefined;
}

/**
 * Try each configured provider with the capability in order, falling back on failure.
 * Never fabricates results: if nothing answers, the caller gets an explicit failure.
 */
let defaultProviders: FlightDataProvider[] | undefined;
/** One provider list per server instance, so rate limiting and caching persist across requests. */
function serverProviders(): FlightDataProvider[] {
  return (defaultProviders ??= configuredProviders());
}

export async function getDepartures(q: DeparturesQuery, providers: FlightDataProvider[] = serverProviders()): Promise<ProviderResult<NormalizedFlight[]>> {
  const invalid = validateDepartures(q);
  if (invalid) return { ok: false, reason: "invalid_request", detail: invalid };
  const key = `${q.carrier}:${q.airport}:${q.to ?? "*"}:${q.date}`;
  const hit = cache.get(key);
  if (hit && hit.ok) return { ...hit, cached: true };

  const candidates = providers.filter((p) => p.capabilities.includes("schedules"));
  const usable = candidates.filter((p) => p.configured() && p.departures);
  if (!usable.length) {
    return {
      ok: false,
      reason: "not_configured",
      detail: candidates.length ? `No live schedule provider is connected (${candidates.map((p) => p.label).join(", ")} needs an API key).` : "No live schedule provider exists.",
    };
  }
  let last: ProviderResult<NormalizedFlight[]> | undefined;
  for (const p of usable) {
    try {
      last = await p.departures!(q);
    } catch (e) {
      last = { ok: false, reason: "unavailable", detail: `${p.label}: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (last.ok) {
      cache.set(key, last);
      return last;
    }
  }
  return last!;
}
