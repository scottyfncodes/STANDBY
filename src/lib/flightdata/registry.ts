import { getAirport } from "@/lib/data/airports";
import { isISODate } from "@/lib/engine/time";
import { TtlCache } from "./cache";
import type { DeparturesQuery, FlightDataProvider, NormalizedFlight, ProviderResult } from "./types";

/**
 * Server-only registry of live flight-data providers. Today none is connected:
 * the recommended first adapter (AeroDataBox) is declared but not implemented until a
 * key is purchased and its responses verified against real data.
 */
export function configuredProviders(env: Record<string, string | undefined> = process.env): FlightDataProvider[] {
  return [
    {
      id: "aerodatabox",
      label: "AeroDataBox",
      capabilities: ["schedules", "status", "history"],
      configured: () => Boolean(env.AERODATABOX_API_KEY),
      async departures() {
        return { ok: false, reason: "not_implemented", detail: "AeroDataBox adapter is planned but not built; STANDBY won't show unverified live data." };
      },
    },
  ];
}

const cache = new TtlCache<ProviderResult<NormalizedFlight[]>>(30 * 60_000);

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
export async function getDepartures(q: DeparturesQuery, providers: FlightDataProvider[] = configuredProviders()): Promise<ProviderResult<NormalizedFlight[]>> {
  const invalid = validateDepartures(q);
  if (invalid) return { ok: false, reason: "invalid_request", detail: invalid };
  const key = `${q.carrier}:${q.airport}:${q.to ?? "*"}:${q.date}`;
  const hit = cache.get(key);
  if (hit && hit.ok) return { ...hit, cached: true };

  const candidates = providers.filter((p) => p.capabilities.includes("schedules") && p.departures);
  const usable = candidates.filter((p) => p.configured());
  if (!usable.length) {
    return { ok: false, reason: "not_configured", detail: candidates.length ? `No live schedule provider is connected (${candidates.map((p) => p.label).join(", ")} available as adapters).` : "No live schedule provider exists." };
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
