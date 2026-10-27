# STANDBY

A smarter way to travel standby. STANDBY starts from your flexibility and finds trips that are realistically worth attempting, with a plan for getting there, backups when a flight doesn't clear, and a way home before your deadline.

## What it does

- **Discover.** Ranked destinations for a flexible window, trip length, deadline, party size, weather, interests, budget, connection tolerance and risk tolerance.
- **Trip planner.** Plan A, ranked Plan B/C fallbacks, a suggested sequence, and a return strategy.
- **Dates.** Every departure date in the window, compared on calendar demand both ways and on spare days before the deadline. Also a 12-month season view.
- **Routes.** Nonstop and one-stop paths with approximate frequency per leg, estimated departure patterns, last realistic same-day attempts and hub-overnight exposure.
- **Fallback engine.** Later flights on the same route, other hubs, nearby departure airports, alternate arrival airports, next-day attempts and hub stranding risk, ranked by practical usefulness.
- **Getting home.** Attempts home per day up to the deadline, the last flight of each day, and the latest sensible first attempt that still keeps a reserve of backups.
- **Evidence.** Every assessment lists its factors, data sources, assumptions and what could change it.

STANDBY never shows a percentage chance of clearing. Without validated standby outcome data it uses qualitative assessments: *More flexible options*, *Workable with backups*, *Limited alternatives*, *High schedule risk* and *Insufficient evidence*.

## Data sources

| Source | State | Notes |
| --- | --- | --- |
| American Airlines reference network (`src/lib/data/aa-network.ts`) | Reference | Approximate daily frequency, block time and seasonality per route. Not a live schedule. |
| US DOT BTS on-time records (`public/data/aa-history.json`) | Historical, free | AA domestic schedules as flown (by month and weekday) plus late-arrival and cancellation rates, Jun 2025 – May 2026. Rebuilt by the "Refresh BTS flight history" GitHub Action (monthly; opens a PR, never pushes to main). See `docs/FLIGHT_DATA.md`. |
| US DOT BTS T-100 segment data (`public/data/aa-loads.json`) | Historical, free | Monthly load factors (passengers ÷ seats) for AA-operated nonstop routes, domestic and international. Shown only as historical context — never as current seat availability. |
| Open-Meteo historical weather (`/api/climate`) | Live, no key | 2021–2025 daily data averaged by month, cached 30 days, falls back to bundled normals. |
| Holiday & demand calendar (`src/lib/engine/calendar.ts`) | Computed | Exact US holidays; demand effects, school breaks and events are labeled general patterns. |
| Live schedules / status (AeroDataBox) | Live, when `AERODATABOX_API_KEY` is set | Trip pages only, at most 4 cached calls per view; without a key the app falls back to history/reference. Not seat or load data. See `docs/FLIGHT_DATA.md`. |
| Public fares (Google Flights via SerpApi) | Live, when `SERPAPI_API_KEY` is set | The "buy a confirmed seat" backup on Backups and Getting home only: up to 2 searches per trip, cached. Prices for sale, never standby availability. See `docs/FLIGHT_DATA.md`. |
| AA standby loads & priority lists | Not available | Only in authorized employee systems. No credential collection or scraping. |

## Architecture

```
src/lib/
  domain/       types, URL encoding of searches
  data/         airports (IANA zones), AA reference network, destinations
  airlines/     AirlineAdapter interface, American Airlines adapter, registry
  eligibility/  travelers, relationships, priority (unknown unless supplied), party assessment
  providers/    provider interfaces + status registry, network builder, Open-Meteo climate
  engine/       time-zone math, itineraries & connections, demand calendar,
                trip assessment, fallbacks & return planning, discovery
src/app/        Next.js App Router pages and the climate API route
src/components/ UI
```

Adding an airline means implementing `AirlineAdapter` (hubs, network provider, connection buffers, rules, load provider) and registering it in `src/lib/airlines/registry.ts`. The engine is carrier-agnostic.

Traveler details and saved trips live only in the browser's `localStorage`. There are no accounts and no server-side storage of employee-related information.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest: scoring, fallbacks, eligibility, return risk, dates & time zones
npm run lint
npm run typecheck
npm run build
```

No environment variables are required. See `.env.example` for future optional providers.
