import { getAirport } from "@/lib/data/airports";
import type { AirportCode, ISODate, LocalTime } from "@/lib/domain/types";
import { addDays, diffDays, todayIn } from "@/lib/engine/time";
import { RateLimiter } from "./cache";
import type { DeparturesQuery, FlightDataProvider, NormalizedFlight, ProviderResult } from "./types";

/**
 * AeroDataBox adapter (API v1.6, "FIDS by local time range", TIER 2).
 *
 * GET /flights/airports/iata/{code}/{fromLocal}/{toLocal}
 *   ?direction=Departure&withLeg=true&withCodeshared=false&withCancelled=true&withCargo=false&withPrivate=false
 *
 * One airport-day = two 12-hour calls (the per-call maximum on the basic tier). Each call returns
 * every departure from that airport, so a single airport-day covers all of American's legs out of
 * it. Responses are cached by Next's data cache to keep unit usage low.
 *
 * Server-only: the key never reaches the browser.
 */

export type Marketplace = "rapidapi" | "apimarket";

export interface AdbConfig {
  apiKey: string;
  marketplace: Marketplace;
  /** Only fetch live schedules this many days ahead (unit budget + provider horizon). */
  maxDaysAhead: number;
}

const ENDPOINTS: Record<Marketplace, { base: string; headers: (key: string) => Record<string, string> }> = {
  rapidapi: {
    base: "https://aerodatabox.p.rapidapi.com",
    headers: (key) => ({ "X-RapidAPI-Key": key, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" }),
  },
  apimarket: {
    base: "https://prod.api.market/api/v1/aedbx/aerodatabox",
    headers: (key) => ({ "x-api-market-key": key }),
  },
};

export function adbConfigFromEnv(env: Record<string, string | undefined> = process.env): AdbConfig | undefined {
  const apiKey = env.AERODATABOX_API_KEY?.trim();
  if (!apiKey) return undefined;
  const marketplace: Marketplace = env.AERODATABOX_MARKETPLACE?.trim().toLowerCase() === "rapidapi" ? "rapidapi" : "apimarket";
  const days = Number(env.AERODATABOX_MAX_DAYS_AHEAD);
  return { apiKey, marketplace, maxDaysAhead: Number.isInteger(days) && days >= 0 && days <= 365 ? days : 30 };
}

/** The two 12-hour local-time windows covering a whole day. */
export function dayWindows(date: ISODate): [string, string][] {
  return [
    [`${date}T00:00`, `${date}T11:59`],
    [`${date}T12:00`, `${date}T23:59`],
  ];
}

export function fidsUrl(cfg: AdbConfig, airport: AirportCode, fromLocal: string, toLocal: string): string {
  const qs = new URLSearchParams({ direction: "Departure", withLeg: "true", withCodeshared: "false", withCancelled: "true", withCargo: "false", withPrivate: "false", withLocation: "false" });
  return `${ENDPOINTS[cfg.marketplace].base}/flights/airports/iata/${airport}/${fromLocal}/${toLocal}?${qs}`;
}

// ——— Response shape (subset we rely on) and normalization

interface AdbTime {
  utc?: string;
  local?: string;
}
interface AdbMovement {
  airport?: { iata?: string; timeZone?: string };
  scheduledTime?: AdbTime;
  revisedTime?: AdbTime;
}
interface AdbFlight {
  number?: string;
  status?: string;
  codeshareStatus?: string;
  isCargo?: boolean;
  airline?: { name?: string; iata?: string };
  departure?: AdbMovement;
  arrival?: AdbMovement;
  movement?: AdbMovement;
}

/** AeroDataBox times look like "2026-11-10 06:05-06:00" (local) and "2026-11-10 12:05Z" (UTC). */
function parseLocal(s?: string): { date: ISODate; time: LocalTime } | undefined {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return m ? { date: m[1]!, time: m[2]! } : undefined;
}
function parseUtc(s?: string): string | undefined {
  if (!s) return undefined;
  const t = Date.parse(s.trim().replace(" ", "T"));
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

const STATUS: Record<string, NonNullable<NormalizedFlight["status"]>> = {
  Expected: "scheduled",
  CheckIn: "boarding",
  Boarding: "boarding",
  GateClosed: "boarding",
  Departed: "departed",
  EnRoute: "en-route",
  Approaching: "en-route",
  Delayed: "delayed",
  Arrived: "landed",
  Canceled: "cancelled",
  CanceledUncertain: "cancelled",
  Diverted: "diverted",
  Unknown: "unknown",
};

/**
 * Normalize a FIDS departures payload into STANDBY's flight shape for one carrier.
 * Drops codeshares (the operating flight is kept), cargo, and anything without a scheduled time.
 */
export function normalizeDepartures(json: unknown, opts: { airport: AirportCode; carrier: string; to?: AirportCode }): NormalizedFlight[] {
  const list = (json as { departures?: AdbFlight[] } | null)?.departures;
  if (!Array.isArray(list)) return [];
  const out: NormalizedFlight[] = [];
  for (const f of list) {
    if (f.isCargo || f.codeshareStatus === "IsCodeshared") continue;
    if ((f.airline?.iata ?? "").toUpperCase() !== opts.carrier) continue;
    const dep = f.departure ?? f.movement;
    const arr = f.arrival;
    const to = arr?.airport?.iata?.toUpperCase();
    if (!to || (opts.to && to !== opts.to)) continue;
    const depLocal = parseLocal(dep?.scheduledTime?.local);
    const depUtc = parseUtc(dep?.scheduledTime?.utc);
    const arrLocal = parseLocal(arr?.scheduledTime?.local);
    const arrUtc = parseUtc(arr?.scheduledTime?.utc);
    if (!depLocal || !depUtc || !arrLocal || !arrUtc) continue;
    const number = (f.number ?? "").replace(/\s+/g, " ").trim();
    out.push({
      carrier: opts.carrier,
      number: number.replace(new RegExp(`^${opts.carrier}\\s*`), ""),
      from: opts.airport,
      to,
      scheduledDep: { local: depLocal, utc: depUtc },
      scheduledArr: { local: arrLocal, utc: arrUtc },
      status: STATUS[f.status ?? "Unknown"] ?? "unknown",
      latestDepUtc: parseUtc(dep?.revisedTime?.utc),
    });
  }
  return dedupe(out);
}

/** The two windows can overlap at the edges; keep one row per flight and departure time. */
function dedupe(flights: NormalizedFlight[]): NormalizedFlight[] {
  const seen = new Set<string>();
  return flights
    .filter((f) => {
      const k = `${f.number}|${f.scheduledDep.utc}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.scheduledDep.utc.localeCompare(b.scheduledDep.utc));
}

// ——— Provider

type Fetcher = (url: string, init: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

export function createAeroDataBox(cfg: AdbConfig, fetcher: Fetcher = fetch as Fetcher, now: () => Date = () => new Date()): FlightDataProvider {
  // RapidAPI's basic tier allows ~1 request/second; stay well under on any plan.
  const limiter = new RateLimiter(20, 30);
  return {
    id: "aerodatabox",
    label: "AeroDataBox",
    capabilities: ["schedules", "status"],
    configured: () => true,
    async departures(q: DeparturesQuery): Promise<ProviderResult<NormalizedFlight[]>> {
      const airport = getAirport(q.airport);
      if (!airport) return { ok: false, reason: "invalid_request", detail: "Unknown airport" };
      const today = todayIn(airport.tz, now());
      const ahead = diffDays(today, q.date);
      if (ahead < -1) return { ok: false, reason: "unsupported", detail: "Live schedules aren't fetched for past dates." };
      if (ahead > cfg.maxDaysAhead) return { ok: false, reason: "unsupported", detail: `Live schedules are fetched for the next ${cfg.maxDaysAhead} days (until ${addDays(today, cfg.maxDaysAhead)}).` };
      // Today's statuses move quickly; future schedules rarely do.
      const revalidate = ahead <= 0 ? 300 : 6 * 3600;
      const all: unknown[] = [];
      for (const [fromLocal, toLocal] of dayWindows(q.date)) {
        if (!limiter.tryTake()) return { ok: false, reason: "rate_limited", detail: "Too many live schedule requests; try again shortly." };
        let res: Response;
        try {
          res = await fetcher(fidsUrl(cfg, q.airport, fromLocal, toLocal), { headers: ENDPOINTS[cfg.marketplace].headers(cfg.apiKey), next: { revalidate } });
        } catch (e) {
          return { ok: false, reason: "unavailable", detail: `AeroDataBox unreachable: ${e instanceof Error ? e.message : String(e)}` };
        }
        if (res.status === 204) continue; // no flights in this window
        if (res.status === 401 || res.status === 403) return { ok: false, reason: "not_configured", detail: `AeroDataBox rejected the API key (${res.status}). Check AERODATABOX_API_KEY and AERODATABOX_MARKETPLACE.` };
        if (res.status === 429) return { ok: false, reason: "rate_limited", detail: "AeroDataBox quota or rate limit reached." };
        if (!res.ok) return { ok: false, reason: "unavailable", detail: `AeroDataBox returned ${res.status}.` };
        all.push(await res.json());
      }
      const flights = all.flatMap((j) => normalizeDepartures(j, { airport: q.airport, carrier: q.carrier, to: q.to }));
      return {
        ok: true,
        data: dedupe(flights),
        provenance: { kind: "live", source: `AeroDataBox (${cfg.marketplace === "rapidapi" ? "RapidAPI" : "API.Market"})`, asOf: now().toISOString(), note: "Published schedule and status at fetch time." },
        cached: false,
      };
    },
  };
}
