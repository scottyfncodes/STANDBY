# Flight data: sources, coverage and limitations

Last reviewed Oct 27, 2026. Provider prices change; confirm on the provider's site before buying anything.

## Data STANDBY uses today (all free)

| Dataset | File | Source | Coverage | Freshness | Used for |
| --- | --- | --- | --- | --- | --- |
| On-time history | `public/data/aa-history.json` | BTS Airline On-Time Performance, **Marketing Carrier** file (PREZIP monthly zips) | US domestic incl. PR/USVI; flights marketed as AA, incl. AA-branded regionals | ~2–3 month lag; window Jun 2025 – May 2026 | Scheduled departure times by month and weekday, operating span (seasonal start/end), block time, cancellation and late-arrival rates |
| Load factors | `public/data/aa-loads.json` | BTS **T-100 Segment (All Carriers)**, TranStats table FMG, download form | Domestic **and** international nonstop segments operated by AA, MQ (Envoy), OH (PSA), PT (Piedmont) | ~3 month lag; TranStats reported data through Jul 2026 | Monthly passengers ÷ seats as historical context |
| Reference network | `src/lib/data/aa-network.ts` | Compiled approximations | AA network incl. international | Static (Oct 2026) | Fallback when no history exists (international routes, new routes) |
| Climate | `/api/climate` | Open-Meteo archive | Global | Live, cached 30 days | Weather by month |

All BTS data is US government work in the public domain. Open-Meteo is CC BY 4.0 and attributed in the app.

### How the T-100 load factors are built (`scripts/bts/build-loads.mjs`)

1. TranStats has no static file for T-100. The script GETs the public download form for table FMG and reads the ASP.NET view state.
2. It POSTs one month at a time with only the needed fields: `YEAR, MONTH, UNIQUE_CARRIER, ORIGIN, DEST, DEPARTURES_SCHEDULED, DEPARTURES_PERFORMED, SEATS, PASSENGERS, CLASS`. The response is a zip containing a CSV.
3. It keeps only:
   - carriers AA, MQ, OH, PT;
   - `CLASS = F` (scheduled passenger service);
   - airports STANDBY knows;
   - rows with seats > 0 and departures > 0.
4. Per directional route and month it sums passengers, seats and departures. It drops route-months with fewer than 8 departures, where an average is meaningless. Load factor = passengers ÷ seats, capped at 100%.
5. The window is the 12 months ending at the latest month TranStats reports for the table.

### Missing values and exclusions

- **SkyWest (OO), Republic (YX) and other capacity-purchase regionals** fly for several airlines and report T-100 under their own code, so their seats can't be attributed to American. Routes flown mainly by them have no load factor; the app then omits the factor rather than guessing.
- **Rows with zero seats or zero departures** (cargo-only or non-revenue movements) are dropped.
- **Missing on-time arrival delay values** are excluded from lateness percentages. Scheduled time `2400` is kept as 23:59 on its flight date.
- **On-time history covers US domestic only.** International times remain reference estimates and are labeled "Estimated".
- **Routes absent from the history** fall back to reference data. Absence is only treated as "didn't operate" for months where the route has history and every month came from the marketing-carrier file, which includes regional partners.

## How STANDBY presents historical data

- Times from history are labeled **"As flown last year"**. They are last year's pattern for the same calendar month and weekday, not this year's published schedule.
- Load factors appear as **"How full flights ran"**, e.g. "averaged 86% full in Nov 2025 (BTS T-100 monthly averages). Historical context only — not today's open seats." They feed one qualitative factor and, at 90% or above, one risk line. They never produce a probability, never claim seats are available, and never say a traveler will or won't clear.
- American's standby loads, priority lists and employee rules remain **unknown**. No source is connected.

## What history corrected in the reference network

Comparing the bundled reference network with as-flown BTS data for Jun 2025 – May 2026:

- **Seasons:** 66 directional routes had the wrong operating months. Examples:
  - FLL–PHX flew only Jan–May.
  - SLC–LAX flew only Jan–Mar.
  - CLT–ABQ and LAX–SJC had no regular service at all.
- **Frequencies:** 85 of 534 November frequencies were off by 3+ flights a day. Examples: TPA–MIA estimated 4, actual 10; AUS–DFW estimated 10, actual 15.
- **Partial-month seasons:** these are now modeled. DFW–HDN (Steamboat), for example, starts mid-December last year.

## Automated refresh (`.github/workflows/bts-history.yml`)

- **Monthly schedule (12th) or manual run, mode `latest`.**
  - Probes BTS for months after the dataset's last month and stops if nothing is new.
  - The job summary says "No new BTS month published after YYYY-MM".
  - If BTS can't be reached at all, the job fails with an error rather than reporting "no new data".
- **Manual run, mode `rebuild`:** rebuilds the current window.
- **Push to a feature branch that changes `scripts/bts/*.mjs`:** rebuilds and commits to that branch, so pipeline changes are reviewed with their data.
- **Never pushes to `main`.** Scheduled and manual refreshes push a `data/bts-refresh-YYYY-MM` branch and open a PR. If the repository disallows Actions-created PRs, the summary links to a compare page instead.
- **Strict:**
  - a missing month fails the job;
  - fewer than 400 history routes or 300 load routes fails it;
  - a history route count more than 20% below the previous dataset fails it.
  - Identical rebuilds don't commit; `generatedAt` is kept when nothing else changed.

## Live providers (not connected; unchanged recommendation)

| Provider | Personal-use cost | Notes |
| --- | --- | --- |
| AeroDataBox (RapidAPI / API.Market) | free basic tier; Pro ≈ $5/mo | Best value for this year's schedules and day-of status |
| FlightAware AeroAPI | Personal tier, ~$5/mo credit, then per query | Per-record billing; history on paid tiers |
| Aviationstack | $49.99/mo for future schedules | Poor value here |
| Cirium / OAG | enterprise quotes | Out of budget |

The provider-independent layer (`src/lib/flightdata/`, `/api/flights/departures`) returns `not_configured` until a provider is authorized and its adapter is verified against real flights.

## Known limitations

- **Last year's pattern isn't this year's schedule.** Route launches, cuts and retimes since then aren't reflected.
- **Holiday weeks are blended into month-level weekday patterns.** For example, last year's Thanksgiving schedule tweaks aren't singled out.
- **Load factors are monthly route averages.** Individual flights, especially the first and last of the day, can differ a lot.
- **International schedules and connection lateness remain estimates.** BTS on-time data is domestic only.
- **Long-haul arrivals:** trip length counts nights from the departure date, so arriving the next day on long-haul flights shortens the stay. The app shows "arrives next day" but doesn't adjust the night count.
