import type { AirportCode, DataProvenance, ISODate } from "@/lib/domain/types";
import type { RouteRecord } from "@/lib/data/aa-network";

/** Connection state of a data provider, shown verbatim in the UI. */
export interface ProviderStatus {
  id: string;
  label: string;
  /** What the provider would supply. */
  provides: string;
  state: "connected" | "reference" | "not_configured" | "not_available";
  detail: string;
  /** Environment variable(s) or authorization needed to connect, if any. */
  requires?: string;
  costNote?: string;
}

/** Route network for one airline: which city pairs operate, how often, how long. */
export interface NetworkProvider {
  id: string;
  provenance: DataProvenance;
  /** Route between two airports operating in a given month (1–12), or undefined. */
  route(from: AirportCode, to: AirportCode, month: number): RouteRecord | undefined;
  /** All airports with service from `from` in `month`. */
  destinationsFrom(from: AirportCode, month: number): AirportCode[];
  /** Whether this airport appears anywhere in the network (any month). */
  serves(code: AirportCode): boolean;
  /** Whether the pair exists in any month (used to explain seasonal gaps). */
  routeAnyMonth(from: AirportCode, to: AirportCode): RouteRecord | undefined;
}

/** Monthly climate summary for a location. */
export interface MonthlyClimate {
  month: number;
  avgHighF: number;
  wetDays?: number;
}

export interface ClimateResult {
  months: MonthlyClimate[];
  provenance: DataProvenance;
}

/**
 * Non-revenue standby load data (seats open vs. listed passengers, priority lists).
 *
 * No implementation exists in this phase. A future implementation must use an
 * authorized integration — never scraped employee portals or collected credentials.
 */
export interface StandbyLoadProvider {
  status: ProviderStatus;
  getLoads?(flight: { carrier: string; number: string; date: ISODate; from: AirportCode; to: AirportCode }): Promise<
    | { kind: "loads"; openSeats: number; listed: number; provenance: DataProvenance }
    | { kind: "unavailable"; reason: string }
  >;
}
