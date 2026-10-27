import type { AirportCode, DataProvenance, ISODate } from "@/lib/domain/types";
import type { NormalizedFlight } from "@/lib/flightdata/types";

/** One airport's live departures for one local date, as returned by /api/flights/departures. */
export interface LiveDay {
  airport: AirportCode;
  date: ISODate;
  flights: NormalizedFlight[];
  provenance: DataProvenance;
}

/**
 * Below this many carrier departures, a fetched airport-day is treated as incomplete coverage
 * rather than proof that a route has no flights.
 */
export const MIN_FLIGHTS_FOR_ABSENCE = 5;

/** Live schedules for the airport-days that were fetched; everything else falls back. */
export class LiveSchedule {
  private days = new Map<string, LiveDay>();

  constructor(days: LiveDay[]) {
    for (const d of days) this.days.set(`${d.airport}|${d.date}`, d);
  }

  get size() {
    return this.days.size;
  }

  day(airport: AirportCode, date: ISODate): LiveDay | undefined {
    return this.days.get(`${airport}|${date}`);
  }

  /**
   * Flights on one leg, or undefined when that airport-day wasn't fetched (caller falls back).
   * An empty list means the airport-day was fetched with good coverage and has no flights to `to`.
   */
  legs(from: AirportCode, to: AirportCode, date: ISODate): NormalizedFlight[] | undefined {
    const d = this.days.get(`${from}|${date}`);
    if (!d) return undefined;
    const legs = d.flights.filter((f) => f.to === to && f.scheduledDep.local.date === date);
    if (!legs.length && d.flights.length < MIN_FLIGHTS_FOR_ABSENCE) return undefined;
    return legs;
  }
}

/** Short Evidence label for a live-schedule request that didn't produce data. */
export function liveFallbackLabel(s: { status: string; reason?: string }): string {
  if (s.status !== "unavailable") return "Loading…";
  if (s.reason === "not_configured") return "Not connected";
  if (s.reason === "unsupported") return "Out of range";
  return "Unavailable";
}
