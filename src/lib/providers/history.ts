import type { AirportCode, DataProvenance, ISODate, LocalTime } from "@/lib/domain/types";
import { isDomestic } from "@/lib/data/airports";
import { monthName, monthOf, weekday } from "@/lib/engine/time";

/**
 * Historical American Airlines schedules and reliability, built offline from US DOT
 * BTS on-time data by `scripts/bts/build-history.mjs`. Domestic US routes only.
 *
 * These are flights *as operated in the same calendar month last year* — strong
 * evidence of the real schedule pattern, but not this year's published schedule.
 */

export interface HistoryFile {
  meta: {
    source: string;
    carrier: string;
    months: { month: string; dataset: "marketing" | "reporting" }[];
    failedMonths: string[];
    generatedAt: string;
  };
  routes: Record<
    string,
    {
      /** Average scheduled block time, minutes. */
      b: number | null;
      /**
       * Calendar month (1–12) → year observed, median flights per day by weekday (Sun..Sat),
       * the operating day-of-month span when the route only flew part of the month (seasonal
       * start/end), and [local time, weekday shares Sun..Sat as digits 0–9].
       */
      m: Record<string, { y: number; n?: number[]; s?: [number, number]; t: [LocalTime, string][] }>;
      r: RouteReliability;
    }
  >;
}

export interface RouteReliability {
  /** Flights observed. */
  n: number;
  /** Percent cancelled / diverted of all flights; percent arriving 15/30/60+ min late of completed flights. */
  cancel: number | null;
  divert: number | null;
  late15: number | null;
  late30: number | null;
  late60: number | null;
}

/** A weekday share digit of 5+ means the time operated on most of that weekday's dates. */
const REGULAR = 5;
/** With a known daily count, accept times that operated on at least ~2 in 9 of that weekday's dates. */
const MIN_SHARE = 2;

export interface HistoricalDay {
  times: LocalTime[];
  blockMin: number | null;
  /** Year and month the pattern was observed in. */
  observed: { year: number; month: number };
}

export interface FlightHistory {
  provenance: DataProvenance;
  /** True when every month came from the marketing-carrier file (includes AA-branded regional partners). */
  complete: boolean;
  covers(from: AirportCode, to: AirportCode): boolean;
  /**
   * Regular departures observed for the same calendar month and weekday.
   * `undefined` = no evidence (fall back); `times: []` = route didn't operate then.
   */
  day(from: AirportCode, to: AirportCode, date: ISODate): HistoricalDay | undefined;
  reliability(from: AirportCode, to: AirportCode): RouteReliability | undefined;
  observedLabel(month: number): string | undefined;
}

export function createHistory(file: HistoryFile): FlightHistory {
  const complete = file.meta.months.length >= 12 && file.meta.months.every((m) => m.dataset === "marketing");
  const months = file.meta.months.map((m) => m.month).sort();
  const provenance: DataProvenance = {
    kind: "historical",
    source: "US DOT BTS on-time performance (as flown)",
    asOf: months.length ? `${months[0]} – ${months[months.length - 1]}` : undefined,
    note: "Scheduled times and reliability observed in the same month last year. Not this year's published schedule.",
  };
  const observedYear = new Map<number, number>();
  for (const m of months) observedYear.set(Number(m.slice(5, 7)), Number(m.slice(0, 4)));

  return {
    provenance,
    complete,
    covers: (from, to) => Boolean(file.routes[`${from}-${to}`]),
    day(from, to, date) {
      const r = file.routes[`${from}-${to}`];
      const month = monthOf(date);
      if (!r) {
        // A domestic pair that never appears in a complete 12-month record of AA-marketed flights
        // (regional partners included) didn't operate last year. International pairs aren't in
        // the on-time data at all, so they fall back to reference estimates.
        const year = observedYear.get(month);
        if (complete && year && isDomestic(from) && isDomestic(to)) return { times: [], blockMin: null, observed: { year, month } };
        return undefined;
      }
      const mo = r.m[String(month)];
      const year = mo?.y ?? observedYear.get(month);
      if (!mo) {
        // The pair flew in other months but not this one. That's only evidence of a seasonal gap
        // when the data includes AA-branded regional partners for every month.
        if (!complete || !year) return undefined;
        return { times: [], blockMin: r.b, observed: { year, month } };
      }
      // Outside last year's operating span this month (seasonal start or end): no service.
      const dom = Number(date.slice(8, 10));
      if (mo.s && complete && (dom < mo.s[0] || dom > mo.s[1])) return { times: [], blockMin: r.b, observed: { year: mo.y, month } };
      const dow = weekday(date);
      const count = mo.n?.[dow];
      const times =
        count === undefined
          ? mo.t.filter(([, shares]) => Number(shares[dow]) >= REGULAR).map(([t]) => t)
          : // The typical number of flights that weekday, taking the most regularly operated times.
            mo.t
              .filter(([, shares]) => Number(shares[dow]) >= MIN_SHARE)
              .sort((a, b) => Number(b[1][dow]) - Number(a[1][dow]))
              .slice(0, count)
              .map(([t]) => t)
              .sort();
      return { times, blockMin: r.b, observed: { year: mo.y, month } };
    },
    reliability: (from, to) => file.routes[`${from}-${to}`]?.r,
    observedLabel(month) {
      const y = observedYear.get(month);
      return y ? `${monthName(month)} ${y}` : undefined;
    },
  };
}

export function isHistoryFile(x: unknown): x is HistoryFile {
  const f = x as HistoryFile;
  return Boolean(f && typeof f === "object" && f.meta && Array.isArray(f.meta.months) && f.routes && typeof f.routes === "object");
}
