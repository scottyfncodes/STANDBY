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
      label: "Live flight schedules & status (AeroDataBox)",
      provides: "This year's published flight numbers, departure and arrival times, and day-of status",
      state: env.AERODATABOX_API_KEY ? "connected" : "not_configured",
      detail: env.AERODATABOX_API_KEY
        ? `Connected via ${env.AERODATABOX_MARKETPLACE?.toLowerCase() === "rapidapi" ? "RapidAPI" : "API.Market"}. Used on trip pages for the next ${Number(env.AERODATABOX_MAX_DAYS_AHEAD) || 30} days: departures from your home airport on the outbound date and from your destination on the return date. Other legs and dates use as-flown history or estimates, labeled as such. If a request fails, the trip page says so and falls back.`
        : "Not connected. The adapter is built; add an AeroDataBox key to enable it. Until then STANDBY uses as-flown history (domestic) or estimates (international).",
      requires: env.AERODATABOX_API_KEY ? undefined : "AERODATABOX_API_KEY (+ AERODATABOX_MARKETPLACE=apimarket|rapidapi)",
      costNote: "AeroDataBox Pro ≈ $5/mo on API.Market; RapidAPI has a small free tier. Each trip page uses up to 4 calls, cached.",
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
      id: "bts-history",
      label: "US DOT on-time records (BTS)",
      provides: "How each American domestic route actually operated: scheduled departure times by month and weekday, block times, late-arrival and cancellation rates",
      state: "connected",
      detail:
        "Free, public-domain data covering the most recent 12 published months (the exact window is shown on each trip's Evidence tab), refreshed by a reviewed GitHub Action. STANDBY uses it for US domestic schedules and misconnect risk. It shows past operation, not this year's published schedule, and doesn't cover international routes.",
      costNote: "Free.",
    },
    {
      id: "bts-t100",
      label: "US DOT T-100 seat & passenger counts (BTS)",
      provides: "How full each American nonstop route ran, by month: passengers ÷ seats (load factor), domestic and international",
      state: "connected",
      detail:
        "Free, public-domain monthly totals, downloaded by a GitHub Action. Shown as historical context only. A monthly average says nothing certain about open seats on a specific flight. Excludes SkyWest and Republic, whose capacity can't be attributed to American.",
      costNote: "Free.",
    },
    americanAirlines.standbyLoads.status,
  ];
}
