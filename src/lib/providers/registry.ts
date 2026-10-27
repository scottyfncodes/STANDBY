import { americanAirlines } from "@/lib/airlines/american";
import type { ProviderStatus } from "./types";

/** Every data source STANDBY knows about, and its honest connection state. Server-only. */
export function providerStatuses(env: Record<string, string | undefined> = process.env): ProviderStatus[] {
  return [
    {
      id: "aa-network",
      label: "American Airlines route network",
      provides: "Which city pairs American serves, approximate daily frequency, block time and seasonality",
      state: "reference",
      detail: "Bundled reference data compiled from public route information (Oct 2026). Approximate and not a live schedule — exact times and operating days must be confirmed on aa.com.",
    },
    {
      id: "climate",
      label: "Open-Meteo historical weather",
      provides: "Average daily highs and wet days by month, from five years (2021–2025) of daily data",
      state: "connected",
      detail: "Free, no key. Fetched server-side and cached for 30 days. If it is unreachable, STANDBY falls back to bundled approximate climate normals and labels them.",
      costNote: "Free for non-commercial use; attribution CC BY 4.0.",
    },
    {
      id: "calendar",
      label: "Holiday & demand calendar",
      provides: "US federal holidays, school break seasons, destination events and peak seasons",
      state: "reference",
      detail: "Holidays are computed exactly. Their effect on standby demand, school breaks and event dates are general patterns — STANDBY says so wherever it uses them.",
    },
    {
      id: "schedules",
      label: "Live flight schedules & status",
      provides: "Actual flight numbers, times, operating days, delays and cancellations",
      state: env.AERODATABOX_API_KEY ? "not_available" : "not_configured",
      detail: env.AERODATABOX_API_KEY
        ? "A key is present, but this integration isn't implemented yet. STANDBY won't show live data until it is built and verified."
        : "Not connected. Candidates (AeroDataBox, FlightAware AeroAPI, Cirium) require API keys and most charge for meaningful volume.",
      requires: "AERODATABOX_API_KEY (future)",
      costNote: "Freemium to paid.",
    },
    {
      id: "fares",
      label: "Public fares & seat inventory",
      provides: "Prices and seats for sale to the public",
      state: "not_configured",
      detail: "Not connected. Even when connected, seats for sale are not the same as standby availability — STANDBY will never use one as a stand-in for the other.",
      requires: "DUFFEL_ACCESS_TOKEN (future)",
    },
    {
      id: "ontime",
      label: "Historical on-time & cancellation data",
      provides: "Route-level delay and cancellation history (US DOT / BTS)",
      state: "not_configured",
      detail: "Public and free, but not yet imported. A future build could add route-specific disruption history to the scoring.",
    },
    americanAirlines.standbyLoads.status,
  ];
}
