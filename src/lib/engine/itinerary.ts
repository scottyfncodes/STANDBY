import type { AirlineAdapter } from "@/lib/airlines/types";
import { getAirport, isDomestic } from "@/lib/data/airports";
import type { AirportCode, ISODate, LocalTime } from "@/lib/domain/types";
import { addDays, minutesToTime, monthOf, timeToMinutes, zonedParts, zonedToUtc } from "./time";

/**
 * A representative departure. Times are ESTIMATED from typical frequency and
 * bank patterns — not a published schedule. `estimated` is always true until a
 * live schedule provider is connected.
 */
export interface Departure {
  from: AirportCode;
  to: AirportCode;
  depUtc: number;
  arrUtc: number;
  depLocal: { date: ISODate; time: LocalTime };
  arrLocal: { date: ISODate; time: LocalTime };
  blockMin: number;
  /** Approximate typical daily frequency of this route. */
  routeDaily: number;
  estimated: true;
}

export interface Itinerary {
  id: string;
  legs: Departure[];
  origin: AirportCode;
  destination: AirportCode;
  via?: AirportCode;
  depUtc: number;
  arrUtc: number;
  totalMin: number;
  layoverMin?: number;
  /** Connection requires an overnight at the hub. */
  overnightConnection: boolean;
  /** Arrives on a later local calendar date than it departs (redeye / long-haul). */
  arrivesLaterDay: boolean;
  /** Smallest daily frequency along the path. */
  weakestDaily: number;
}

type Region = "na" | "eu" | "asia" | "hi" | "sa-long";

function region(code: AirportCode): Region {
  const a = getAirport(code);
  if (!a) return "na";
  if (a.tz.startsWith("Europe/")) return "eu";
  if (a.tz.startsWith("Asia/")) return "asia";
  if (a.tz === "Pacific/Honolulu") return "hi";
  if (a.country === "AR" || a.country === "PE") return "sa-long";
  return "na";
}

/** Typical local departure windows (minutes after midnight) by market direction. */
function departureWindow(from: AirportCode, to: AirportCode, daily: number): [number, number] {
  const rf = region(from);
  const rt = region(to);
  const t = timeToMinutes;
  if (rf === "na" && rt === "eu") return [t("16:30"), t("21:30")];
  if (rf === "eu" && rt === "na") return [t("09:00"), t("15:30")];
  if (rf === "na" && rt === "asia") return [t("10:30"), t("13:30")];
  if (rf === "asia" && rt === "na") return [t("15:30"), t("18:30")];
  if (rf === "na" && rt === "hi") return [t("07:30"), t("13:30")];
  if (rf === "hi" && rt === "na") return [t("12:30"), t("22:30")];
  if (rf === "na" && rt === "sa-long") return [t("15:30"), t("23:15")];
  if (rf === "sa-long" && rt === "na") return [t("20:00"), t("23:45")];
  return daily >= 8 ? [t("06:00"), t("21:30")] : [t("06:30"), t("20:30")];
}

/** Representative local departure times for a route with `daily` flights. */
export function representativeSlots(from: AirportCode, to: AirportCode, daily: number): LocalTime[] {
  const [start, end] = departureWindow(from, to, daily);
  if (daily <= 1) return [minutesToTime(Math.round((start + end) / 2 / 5) * 5)];
  const step = (end - start) / (daily - 1);
  return Array.from({ length: daily }, (_, i) => minutesToTime(Math.round((start + i * step) / 5) * 5));
}

export class ItineraryEngine {
  private depCache = new Map<string, Departure[]>();
  private dayCache = new Map<string, Itinerary[]>();
  private onwardCache = new Map<string, Departure[]>();
  private dayOptionsCache = new Map<string, DayOptions>();

  constructor(readonly airline: AirlineAdapter) {}

  /** Representative departures for one route on one local date. Empty if not operating. */
  departures(from: AirportCode, to: AirportCode, date: ISODate): Departure[] {
    const key = `${from}-${to}-${date}`;
    const cached = this.depCache.get(key);
    if (cached) return cached;
    const route = this.airline.network.route(from, to, monthOf(date));
    const fa = getAirport(from);
    const ta = getAirport(to);
    let out: Departure[] = [];
    if (route && fa && ta) {
      out = representativeSlots(from, to, route.daily).map((time) => {
        const depUtc = zonedToUtc(date, time, fa.tz);
        const arrUtc = depUtc + route.blockMin * 60_000;
        return {
          from,
          to,
          depUtc,
          arrUtc,
          depLocal: { date, time },
          arrLocal: zonedParts(arrUtc, ta.tz),
          blockMin: route.blockMin,
          routeDaily: route.daily,
          estimated: true as const,
        };
      });
    }
    this.depCache.set(key, out);
    return out;
  }

  /** Departures from `hub` on `date` and the following day, sorted by time. */
  private onward(hub: AirportCode, destination: AirportCode, date: ISODate): Departure[] {
    const key = `${hub}-${destination}-${date}`;
    let list = this.onwardCache.get(key);
    if (!list) {
      list = [...this.departures(hub, destination, date), ...this.departures(hub, destination, addDays(date, 1))].sort((a, b) => a.depUtc - b.depUtc);
      this.onwardCache.set(key, list);
    }
    return list;
  }

  /** Memoized `dayOptions` for this engine. */
  day(origins: AirportCode[], destinations: AirportCode[], date: ISODate, allowConnections: boolean): DayOptions {
    const key = `${origins.join(",")}>${destinations.join(",")}@${date}:${allowConnections}`;
    let d = this.dayOptionsCache.get(key);
    if (!d) {
      d = computeDayOptions(this, origins, destinations, date, allowConnections);
      this.dayOptionsCache.set(key, d);
    }
    return d;
  }

  /**
   * A connection is an overnight at the hub when the wait spans the small hours
   * (02:00 local). A redeye that lands at 6am and connects onward is not.
   */
  private spansNight(hub: AirportCode, arrUtc: number, depUtc: number, arrDate: ISODate): boolean {
    const tz = getAirport(hub)?.tz;
    if (!tz) return false;
    return [arrDate, addDays(arrDate, 1)].some((d) => {
      const twoAm = zonedToUtc(d, "02:00", tz);
      return twoAm >= arrUtc && twoAm <= depUtc;
    });
  }

  private bufferMin(first: Departure, second: Departure): number {
    const b = this.airline.connectionBufferMin;
    const enteringUS = !isDomestic(first.from) && isDomestic(first.to);
    if (enteringUS) return b.usEntry;
    if (!isDomestic(first.from) || !isDomestic(second.to)) return b.international;
    return b.domestic;
  }

  /**
   * All itineraries departing `origin` on local `date` toward `destination`:
   * nonstops plus one-stop connections through the airline's hubs.
   */
  itineraries(origin: AirportCode, destination: AirportCode, date: ISODate, allowConnections = true): Itinerary[] {
    const key = `${origin}-${destination}-${date}-${allowConnections}`;
    const cached = this.dayCache.get(key);
    if (cached) return cached;
    const result: Itinerary[] = [];

    for (const d of this.departures(origin, destination, date)) result.push(makeItinerary([d]));

    if (allowConnections) {
      for (const hub of this.airline.hubs) {
        if (hub === origin || hub === destination) continue;
        const firsts = this.departures(origin, hub, date);
        if (!firsts.length) continue;
        for (const f of firsts) {
          const onward = this.onward(hub, destination, f.arrLocal.date);
          if (!onward.length) continue;
          const buffer = this.bufferMin(f, onward[0]!) * 60_000;
          const next = onward.find((s) => s.depUtc >= f.arrUtc + buffer);
          if (!next) continue;
          const layoverMin = (next.depUtc - f.arrUtc) / 60_000;
          if (layoverMin > 20 * 60) continue;
          result.push(makeItinerary([f, next], layoverMin, this.spansNight(hub, f.arrUtc, next.depUtc, f.arrLocal.date)));
        }
      }
    }

    result.sort((a, b) => a.depUtc - b.depUtc || a.totalMin - b.totalMin);
    this.dayCache.set(key, result);
    return result;
  }
}

function makeItinerary(legs: Departure[], layoverMin?: number, overnightAtHub = false): Itinerary {
  const first = legs[0]!;
  const last = legs[legs.length - 1]!;
  const via = legs.length > 1 ? first.to : undefined;
  return {
    id: legs.map((l) => `${l.from}${l.to}${l.depLocal.date}${l.depLocal.time}`).join("_"),
    legs,
    origin: first.from,
    destination: last.to,
    via,
    depUtc: first.depUtc,
    arrUtc: last.arrUtc,
    totalMin: (last.arrUtc - first.depUtc) / 60_000,
    layoverMin,
    overnightConnection: overnightAtHub,
    arrivesLaterDay: last.arrLocal.date > first.depLocal.date,
    weakestDaily: Math.min(...legs.map((l) => l.routeDaily)),
  };
}

/** Summary of how many realistic attempts a day offers between two airport sets. */
export interface DayOptions {
  date: ISODate;
  itineraries: Itinerary[];
  /** Distinct flights into the destination you could try for (same-day, no hub overnight). */
  depth: number;
  nonstopCount: number;
  hubs: AirportCode[];
  /** Latest same-day itinerary departure (no hub overnight). */
  lastChance?: Itinerary;
  firstChance?: Itinerary;
  /** At least one connection would strand you overnight at a hub. */
  overnightExposure: boolean;
}

export function dayOptions(
  engine: ItineraryEngine,
  origins: AirportCode[],
  destinations: AirportCode[],
  date: ISODate,
  allowConnections: boolean,
): DayOptions {
  return engine.day(origins, destinations, date, allowConnections);
}

function computeDayOptions(
  engine: ItineraryEngine,
  origins: AirportCode[],
  destinations: AirportCode[],
  date: ISODate,
  allowConnections: boolean,
): DayOptions {
  const all: Itinerary[] = [];
  for (const o of origins) for (const d of destinations) if (o !== d) all.push(...engine.itineraries(o, d, date, allowConnections));
  all.sort((a, b) => a.depUtc - b.depUtc);
  const sameDay = all.filter((i) => !i.overnightConnection);
  const finalLegs = new Set(sameDay.map((i) => {
    const l = i.legs[i.legs.length - 1]!;
    return `${l.from}${l.to}${l.depUtc}`;
  }));
  return {
    date,
    itineraries: all,
    depth: finalLegs.size,
    nonstopCount: sameDay.filter((i) => i.legs.length === 1).length,
    hubs: [...new Set(sameDay.flatMap((i) => (i.via ? [i.via] : [])))],
    lastChance: sameDay[sameDay.length - 1],
    firstChance: sameDay[0],
    overnightExposure: all.some((i) => i.overnightConnection),
  };
}

export interface PathSummary {
  key: string;
  origin: AirportCode;
  destination: AirportCode;
  via?: AirportCode;
  /** Approximate daily frequency per leg. */
  legDaily: number[];
  weakestDaily: number;
  /** Itineraries for the day along this path. */
  options: Itinerary[];
  typicalMin: number;
  overnightRisk: boolean;
}

/** Group a day's itineraries by path (origin → [hub] → destination). */
export function summarizePaths(day: DayOptions): PathSummary[] {
  const groups = new Map<string, Itinerary[]>();
  for (const i of day.itineraries) {
    const key = `${i.origin}-${i.via ?? ""}-${i.destination}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }
  return [...groups.entries()]
    .map(([key, options]) => {
      const first = options[0]!;
      const sameDay = options.filter((o) => !o.overnightConnection);
      return {
        key,
        origin: first.origin,
        destination: first.destination,
        via: first.via,
        legDaily: first.legs.map((l) => l.routeDaily),
        weakestDaily: first.weakestDaily,
        options,
        typicalMin: Math.min(...options.map((o) => o.totalMin)),
        overnightRisk: options.some((o) => o.overnightConnection) || sameDay.length === 0,
      };
    })
    .sort((a, b) => pathUsefulness(b) - pathUsefulness(a));
}

/** Practical usefulness: nonstops and frequent legs beat theoretical options. */
export function pathUsefulness(p: PathSummary): number {
  const sameDay = p.options.filter((o) => !o.overnightConnection).length;
  const directness = p.via ? 0 : 3;
  return directness + Math.min(sameDay, 10) * 0.6 + Math.min(p.weakestDaily, 8) * 0.4 - p.typicalMin / 600 - (p.overnightRisk ? 1.5 : 0);
}
