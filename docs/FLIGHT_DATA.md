# Flight data: research, audit and architecture (Phase 2)

Researched Oct 27, 2026. Prices change; confirm on the provider's site before buying.

## Providers compared

| Provider | Cost for personal use | Schedules | Live status | History | Notes |
| --- | --- | --- | --- | --- | --- |
| **US DOT BTS on-time data** | Free, public domain | As flown, domestic, ~5-month lag | No | Yes, route-level | **Now integrated** via `scripts/bts/build-history.mjs` |
| **AeroDataBox** (RapidAPI / API.Market) | Basic: free, small quota, commercial use reportedly not allowed on new free plans · Pro ≈ $5/mo · Pro 2 $15 · Ultra ≈ $30 · Mega ≈ $150 | Airport departures (FIDS), flight schedules up to ~180–365 days ahead depending on plan | Yes | Flight-number delay statistics | Best value; recommended first live adapter |
| **FlightAware AeroAPI** | Personal tier: no minimum, ~$5/mo usage credit, then per-query (~$0.002–$0.05 per result set) | `/schedules` up to ~12 months ahead | Yes | Historical endpoints reportedly Standard tier ($100/mo minimum) and above | Excellent data; per-record billing makes full-airport schedules costly |
| **Aviationstack** | Free: 100 requests/mo, no future schedules · Basic $49.99/mo | Future schedules on paid plans | Yes | Limited | Poor value for this use |
| **Cirium / OAG** | Enterprise quotes; trials only | Best-in-class, 12–24 months forward | Yes | Yes | Out of budget for a personal app |
| **Amadeus Self-Service** | Shut down July 17, 2026 | — | — | — | Not an option |

None of these provide non-revenue standby loads or priority lists. Seats for sale (fares APIs) are not standby availability.

## What the app relied on before Phase 2

- **Frequencies and seasonality** were hand-compiled approximations (`src/lib/data/aa-network.ts`).
- **Departure times** were synthesized by spreading the frequency across a typical window. Every "first flight", "last flight of the day" and "latest sensible attempt" depended on these invented times.
- **Every route was assumed to fly every day**, so weekday schedule differences were invisible.
- **Connections** used fixed 60/90/120-minute planning buffers with no evidence of how often the first leg runs late.
- **Bug:** attempts home on the deadline day counted redeyes that land the next morning, after the deadline.
- **No route reliability data:** no cancellation or delay rates.

## What Phase 2 changed

1. **BTS history** (free). Covers Jun 2025 – May 2026 across 802 AA-marketed domestic routes, including Puerto Rico and USVI.
   - **Schedule pattern:** for each route and month, the regularly operated departure times and the median flights per weekday, with mid-month time shifts merged.
   - **Reliability:** cancellation, diversion, and the share of flights arriving 15, 30 or 60+ minutes late.
2. **Engine** (`ItineraryEngine` with `FlightHistory`).
   - **Times:** uses as-flown times for the same month and weekday when history exists, and falls back to reference estimates otherwise. Every departure carries a `basis`.
   - **Seasonal gaps:** honored only when the data includes AA-branded regional partners for every month.
   - **Misconnects:** connections carry historical misconnect evidence. The delay a connection can absorb is the layover minus a 30-minute floor, compared against the first leg's late-arrival rate.
   - **Deadline fix:** attempts home now count only if they land by the end of the deadline day in the home airport's time zone.
   - **Routes tab:** resilience notes explain whether a misconnect leaves later onward flights, show historical lateness, and flag once-daily legs.
3. **Provider-independent live layer** (`src/lib/flightdata/`).
   - Normalized flight types, a provider chain with fallback, a TTL cache and a rate limiter.
   - `/api/flights/departures` returns an explicit `not_configured` result today.
   - Credentials are read server-side only.

## Recommended next steps

1. **Optional, about $5/month.** Buy AeroDataBox Pro on API.Market, add `AERODATABOX_API_KEY` in Vercel, and implement the adapter in `src/lib/flightdata/registry.ts`. It would provide this year's real flight numbers and times for the next weeks, plus day-of status, and would replace last-year history for near-term dates. Verify responses against real flights before enabling.
2. **Free.** Re-run the "Refresh BTS flight history" workflow monthly as BTS publishes new months (Actions → Run workflow, `branch: main`, updated months).
3. **Free, later.** BTS T-100 segment data (seats and passengers by route and month) would give real historical load factors, the best public proxy for standby difficulty. It needs a form-based download.
