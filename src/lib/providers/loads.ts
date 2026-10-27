import type { AirportCode, DataProvenance } from "@/lib/domain/types";
import { monthName } from "@/lib/engine/time";

/**
 * Historical load factors (passengers ÷ seats) by nonstop route and calendar month, from
 * US DOT BTS T-100 segment data, built by `scripts/bts/build-loads.mjs`.
 *
 * A load factor is a monthly AVERAGE across all of a route's flights last year. It says how
 * full flights tended to be — useful context for standby — but it is NOT current seat
 * availability and says nothing certain about any specific flight.
 */

export interface LoadsFile {
  meta: { source: string; carriers: string; excluded: string; months: string[]; failedMonths: string[]; latestAvailable: string | null; generatedAt: string };
  /** route "AAA-BBB" → month (1–12) → [load factor %, departures performed, year observed] */
  routes: Record<string, Record<string, [number, number, number]>>;
}

export interface RouteLoad {
  loadFactor: number;
  departures: number;
  year: number;
  month: number;
}

export type LoadBand = "roomier" | "typical" | "full" | "very-full";

export function loadBand(lf: number): LoadBand {
  if (lf < 75) return "roomier";
  if (lf < 85) return "typical";
  if (lf < 90) return "full";
  return "very-full";
}

export const LOAD_BAND_LABEL: Record<LoadBand, string> = {
  roomier: "Often had empty seats",
  typical: "Typically busy",
  full: "Usually quite full",
  "very-full": "Usually very full",
};

export interface FlightLoads {
  provenance: DataProvenance;
  route(from: AirportCode, to: AirportCode, month: number): RouteLoad | undefined;
  /** "Nov 2025" style label for the observed month of a route, if any. */
  label(load: RouteLoad): string;
}

export function createLoads(file: LoadsFile): FlightLoads {
  const months = [...file.meta.months].sort();
  return {
    provenance: {
      kind: "historical",
      source: "US DOT BTS T-100 segment data",
      asOf: months.length ? `${months[0]} – ${months[months.length - 1]}` : undefined,
      note: "Monthly average passengers ÷ seats from the most recent BTS data. Not current seat availability.",
    },
    route(from, to, month) {
      const v = file.routes[`${from}-${to}`]?.[String(month)];
      return v ? { loadFactor: v[0], departures: v[1], year: v[2], month } : undefined;
    },
    label: (l) => `${monthName(l.month)} ${l.year}`,
  };
}

export function isLoadsFile(x: unknown): x is LoadsFile {
  const f = x as LoadsFile;
  return Boolean(f && typeof f === "object" && f.meta && Array.isArray(f.meta.months) && f.routes && typeof f.routes === "object");
}
