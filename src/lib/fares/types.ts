import type { AirportCode, DataProvenance, ISODate, LocalTime } from "@/lib/domain/types";
import type { FailureReason } from "@/lib/flightdata/types";

/**
 * Public fares for sale, normalized from a provider. Used only to price the "buy a confirmed
 * seat" backup. Seats for sale are not standby availability, and STANDBY never treats them so.
 */

export interface FareOption {
  /** Whole currency units for one adult, as the provider quoted it. */
  price: number;
  /** IATA codes of the marketing airlines on the itinerary, e.g. ["AA"]. */
  airlines: string[];
  /** Display names of those airlines, e.g. ["American"]. */
  airlineNames: string[];
  /** Flight numbers as "AA 1234", in leg order. */
  flights: string[];
  from: AirportCode;
  to: AirportCode;
  dep: { date: ISODate; time: LocalTime };
  arr: { date: ISODate; time: LocalTime };
  stops: number;
  durationMin: number;
}

export interface FareQuote {
  from: AirportCode[];
  to: AirportCode[];
  date: ISODate;
  currency: string;
  /** Cheapest itinerary on any airline. */
  cheapest?: FareOption;
  /** Cheapest itinerary flown entirely on the user's airline. */
  cheapestOnAirline?: FareOption;
  airline: string;
  /** Google's "typical" price range for this route and date, when it gives one. */
  typicalRange?: [number, number];
  priceLevel?: "low" | "typical" | "high";
  /** Public link to the same search, for checking and booking. */
  searchUrl?: string;
}

export type FareResult = { ok: true; data: FareQuote; provenance: DataProvenance; cached: boolean } | { ok: false; reason: FailureReason; detail: string };

export interface FareQuery {
  /** One or more origin airports (searched together). */
  from: AirportCode[];
  to: AirportCode[];
  date: ISODate;
  /** The user's airline, for the "on American" figure. */
  airline: string;
}
