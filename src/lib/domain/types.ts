/**
 * Core domain types for STANDBY.
 *
 * Every piece of data that reaches the UI carries provenance (`DataProvenance`)
 * so the interface can always say where a number came from and how fresh it is.
 */

/** Calendar date without a time zone, `YYYY-MM-DD`. */
export type ISODate = string;

/** Local wall-clock time, `HH:MM` (24h). */
export type LocalTime = string;

export type AirportCode = string;

export interface Airport {
  code: AirportCode;
  name: string;
  city: string;
  country: string; // ISO 3166-1 alpha-2
  /** IANA time zone, e.g. `America/Chicago`. */
  tz: string;
  lat: number;
  lon: number;
}

/**
 * How trustworthy a piece of data is.
 * - `live`: fetched from a connected provider at `fetchedAt`.
 * - `historical`: observed in past operations (e.g. US DOT on-time records) — real, but not current.
 * - `reference`: bundled reference data compiled from public information; approximate.
 * - `estimate`: derived by STANDBY's own heuristics.
 * - `user`: supplied by the traveler.
 * - `unavailable`: no source is connected.
 */
export type ProvenanceKind = "live" | "historical" | "reference" | "estimate" | "user" | "unavailable";

export interface DataProvenance {
  kind: ProvenanceKind;
  source: string;
  /** ISO timestamp for live data; compile date for reference data. */
  asOf?: string;
  note?: string;
}

export type Scope = "any" | "domestic" | "international";
export type Climate = "hot" | "warm" | "mild" | "cool" | "snow";
export type Interest =
  | "beach"
  | "city"
  | "outdoors"
  | "culture"
  | "food"
  | "events"
  | "relaxation";
export type Budget = 1 | 2 | 3;
export type Complexity = "nonstop" | "one-stop";
export type RiskTolerance = "cautious" | "balanced" | "adventurous";

export interface TripRequest {
  origins: AirportCode[];
  /** Include nearby alternate departure airports from the traveler profile. */
  useAlternateOrigins: boolean;
  /** Earliest and latest acceptable departure dates. */
  windowStart: ISODate;
  windowEnd: ISODate;
  nights: number;
  /** Hard deadline: must be home by the end of this date. */
  homeBy?: ISODate;
  travelers: number;
  scope: Scope;
  climates: Climate[];
  interests: Interest[];
  budget?: Budget;
  complexity: Complexity;
  /** Willing to land at an alternate destination airport. */
  allowAlternateDestinations: boolean;
  risk: RiskTolerance;
}
