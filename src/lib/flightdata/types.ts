import type { AirportCode, DataProvenance, ISODate, LocalTime } from "@/lib/domain/types";

/**
 * Provider-independent flight data. Every provider adapter (AeroDataBox, FlightAware
 * AeroAPI, …) normalizes into these shapes on the server; the UI never sees a
 * provider's raw format or credentials.
 */

export type FlightDataCapability = "schedules" | "status" | "history";

export interface NormalizedFlight {
  carrier: string; // IATA, e.g. "AA"
  number: string; // "1234"
  operatingCarrier?: string;
  from: AirportCode;
  to: AirportCode;
  scheduledDep: { local: { date: ISODate; time: LocalTime }; utc: string };
  scheduledArr: { local: { date: ISODate; time: LocalTime }; utc: string };
  status?: "scheduled" | "boarding" | "departed" | "en-route" | "landed" | "delayed" | "cancelled" | "diverted" | "unknown";
  /** Best known departure time (estimated/actual) when the provider reports one. */
  latestDepUtc?: string;
}

export type FailureReason = "not_configured" | "not_implemented" | "rate_limited" | "unavailable" | "unsupported" | "invalid_request";

export type ProviderResult<T> =
  | { ok: true; data: T; provenance: DataProvenance; cached: boolean }
  | { ok: false; reason: FailureReason; detail: string };

export interface DeparturesQuery {
  airport: AirportCode;
  date: ISODate;
  carrier: string;
  /** Optional destination filter. */
  to?: AirportCode;
}

export interface FlightDataProvider {
  id: string;
  label: string;
  capabilities: FlightDataCapability[];
  /** Whether credentials are present (checked server-side only). */
  configured(): boolean;
  departures?(q: DeparturesQuery): Promise<ProviderResult<NormalizedFlight[]>>;
}
