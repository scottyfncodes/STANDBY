import { getAirport } from "@/lib/data/airports";
import type { ISODate, LocalTime } from "@/lib/domain/types";
import { addDays, diffDays, todayIn } from "@/lib/engine/time";
import { RateLimiter } from "@/lib/flightdata/cache";
import type { FareProvider } from "./registry";
import type { FareOption, FareQuery, FareQuote, FareResult } from "./types";

/**
 * SerpApi "Google Flights" adapter. One search per query: a one-way economy fare for one adult
 * between two airport groups on one date, in USD, without an airline filter so the same result
 * gives both the cheapest fare overall and the cheapest on the user's airline.
 *
 * GET https://serpapi.com/search.json?engine=google_flights&type=2&departure_id=…&arrival_id=…
 *   &outbound_date=YYYY-MM-DD&travel_class=1&adults=1&currency=USD&hl=en&gl=us&api_key=…
 *
 * Server-only: the key travels in the query string, so URLs are never logged or returned.
 */

export interface SerpApiConfig {
  apiKey: string;
  /** Google Flights sells roughly 11 months ahead. */
  maxDaysAhead: number;
}

export function serpApiConfigFromEnv(env: Record<string, string | undefined> = process.env): SerpApiConfig | undefined {
  const apiKey = env.SERPAPI_API_KEY?.trim();
  return apiKey ? { apiKey, maxDaysAhead: 330 } : undefined;
}

export function serpApiUrl(cfg: SerpApiConfig, q: FareQuery): string {
  const qs = new URLSearchParams({
    engine: "google_flights",
    type: "2",
    departure_id: q.from.join(","),
    arrival_id: q.to.join(","),
    outbound_date: q.date,
    travel_class: "1",
    adults: "1",
    currency: "USD",
    hl: "en",
    gl: "us",
    api_key: cfg.apiKey,
  });
  return `https://serpapi.com/search.json?${qs}`;
}

// ——— Response shape (subset we rely on) and normalization

interface SerpAirportTime {
  id?: string;
  name?: string;
  /** "2026-11-11 05:10" (airport local time) */
  time?: string;
}
interface SerpSegment {
  departure_airport?: SerpAirportTime;
  arrival_airport?: SerpAirportTime;
  airline?: string;
  flight_number?: string;
}
interface SerpItinerary {
  flights?: SerpSegment[];
  total_duration?: number;
  price?: number;
}
interface SerpResponse {
  best_flights?: SerpItinerary[];
  other_flights?: SerpItinerary[];
  price_insights?: { lowest_price?: number; price_level?: string; typical_price_range?: number[] };
  search_metadata?: { status?: string; google_flights_url?: string };
  error?: string;
}

function parseLocal(s?: string): { date: ISODate; time: LocalTime } | undefined {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  return m ? { date: m[1]!, time: `${m[2]!.padStart(2, "0")}:${m[3]!}` } : undefined;
}

/** "AA 1226" → "AA"; Google prints the marketing carrier's IATA code first. */
const carrierOf = (flightNumber: string) => flightNumber.match(/^([A-Z0-9]{2})\s*\d/)?.[1];

export function normalizeItinerary(it: SerpItinerary): FareOption | undefined {
  const segs = it.flights ?? [];
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (!first || !last || typeof it.price !== "number" || !(it.price > 0)) return undefined;
  const dep = parseLocal(first.departure_airport?.time);
  const arr = parseLocal(last.arrival_airport?.time);
  const from = first.departure_airport?.id;
  const to = last.arrival_airport?.id;
  if (!dep || !arr || !from || !to) return undefined;
  const flights = segs.map((s) => (s.flight_number ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const airlines = [...new Set(flights.map(carrierOf).filter((c): c is string => !!c))];
  return {
    price: Math.round(it.price),
    airlines,
    airlineNames: [...new Set(segs.map((s) => s.airline).filter((a): a is string => !!a))],
    flights,
    from,
    to,
    dep,
    arr,
    stops: segs.length - 1,
    durationMin: it.total_duration ?? 0,
  };
}

export function normalizeFares(json: unknown, q: FareQuery): FareQuote {
  const r = (json ?? {}) as SerpResponse;
  const options = [...(r.best_flights ?? []), ...(r.other_flights ?? [])]
    .map(normalizeItinerary)
    .filter((o): o is FareOption => !!o && o.dep.date === q.date)
    .sort((a, b) => a.price - b.price || a.dep.time.localeCompare(b.dep.time));
  const range = r.price_insights?.typical_price_range;
  const level = r.price_insights?.price_level;
  return {
    from: q.from,
    to: q.to,
    date: q.date,
    currency: "USD",
    airline: q.airline,
    cheapest: options[0],
    cheapestOnAirline: options.find((o) => o.airlines.length > 0 && o.airlines.every((a) => a === q.airline)),
    typicalRange: Array.isArray(range) && range.length === 2 && range.every((n) => typeof n === "number") ? [range[0]!, range[1]!] : undefined,
    priceLevel: level === "low" || level === "typical" || level === "high" ? level : undefined,
    searchUrl: r.search_metadata?.google_flights_url?.startsWith("https://www.google.com/") ? r.search_metadata.google_flights_url : undefined,
  };
}

// ——— Provider

type Fetcher = (url: string, init: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

/** SerpApi reports "no results" as an error string, not an empty list. */
const NO_RESULTS = /hasn't returned any results|no results/i;

export function createSerpApiFares(cfg: SerpApiConfig, fetcher: Fetcher = fetch as Fetcher, now: () => Date = () => new Date()): FareProvider {
  // Each search spends quota; keep bursts small on any plan.
  const limiter = new RateLimiter(10, 30);
  return {
    label: "SerpApi",
    async quote(q: FareQuery): Promise<FareResult> {
      const tz = getAirport(q.from[0]!)?.tz;
      const today = todayIn(tz, now());
      const ahead = diffDays(today, q.date);
      if (ahead < 0) return { ok: false, reason: "unsupported", detail: "Fares aren't checked for past dates." };
      if (ahead > cfg.maxDaysAhead) return { ok: false, reason: "unsupported", detail: `Fares are checked up to ${cfg.maxDaysAhead} days ahead (until ${addDays(today, cfg.maxDaysAhead)}).` };
      if (!limiter.tryTake()) return { ok: false, reason: "rate_limited", detail: "Too many fare checks; try again shortly." };

      let res: Response;
      try {
        // Fares move during the day; 6 h keeps repeat visits free without going badly stale.
        res = await fetcher(serpApiUrl(cfg, q), { next: { revalidate: 6 * 3600 } });
      } catch {
        return { ok: false, reason: "unavailable", detail: "SerpApi unreachable." };
      }
      let body: SerpResponse | undefined;
      try {
        body = (await res.json()) as SerpResponse;
      } catch {
        body = undefined;
      }
      const err = body?.error;
      if (err && NO_RESULTS.test(err)) {
        // A real answer: Google has no fares for this search.
        return { ok: true, data: normalizeFares({}, q), provenance: provenance(now), cached: false };
      }
      if (res.status === 401 || res.status === 403 || /invalid api key/i.test(err ?? "")) return { ok: false, reason: "not_configured", detail: "SerpApi rejected the API key. Check SERPAPI_API_KEY." };
      if (res.status === 429 || /run out of searches|rate limit/i.test(err ?? "")) return { ok: false, reason: "rate_limited", detail: "SerpApi search quota or rate limit reached." };
      if (!res.ok || !body || err) return { ok: false, reason: "unavailable", detail: `SerpApi returned ${res.status}${err ? ": " + err.slice(0, 120) : ""}.` };
      return { ok: true, data: normalizeFares(body, q), provenance: provenance(now), cached: false };
    },
  };
}

function provenance(now: () => Date) {
  return { kind: "live" as const, source: "Google Flights via SerpApi", asOf: now().toISOString(), note: "Public one-way fares for one adult at search time." };
}
