# Flight data: sources, coverage and limitations

Last reviewed Oct 27, 2026. Provider prices change; confirm on the provider's site before buying anything.

## Data STANDBY uses today (all free)

| Dataset | File | Source | Coverage | Freshness | Used for |
| --- | --- | --- | --- | --- | --- |
| On-time history | `public/data/aa-history.json` | BTS Airline On-Time Performance, **Marketing Carrier** file (PREZIP monthly zips) | US domestic incl. PR/USVI; flights marketed as AA, incl. AA-branded regionals: 814 directional routes | ~4–5 month lag; Jun 2025 – May 2026 | Scheduled departure times by month and weekday, operating span (seasonal start/end), block time, cancellation and late-arrival rates |
| Load factors | `public/data/aa-loads.json` | BTS **T-100 Segment (All Carriers)**, TranStats table FMG, download form | Domestic **and** international nonstop segments operated by AA, MQ (Envoy), OH (PSA), PT (Piedmont): 949 directional routes, 260 with one end outside the US | ~3 month lag; Aug 2025 – Jul 2026 | Monthly passengers ÷ seats as historical context |
| Reference network | `src/lib/data/aa-network.ts` | Compiled approximations | AA network incl. international | Static (Oct 2026) | Fallback when no history exists (international routes, new routes) |
| Climate | `/api/climate` | Open-Meteo archive | Global | Live, cached 30 days | Weather by month |

All BTS data is US government work in the public domain. Open-Meteo is CC BY 4.0 and attributed in the app.

### How the T-100 load factors are built (`scripts/bts/build-loads.mjs`)

1. TranStats has no static file for T-100. The script GETs the public download form for table FMG and reads the ASP.NET view state. That's 12 small requests a month, with no credentials.
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
- **Absence counts as evidence for domestic pairs only.** A domestic pair that never appears in a complete 12-month marketing-carrier record (regional partners included) is treated as not operated.
  - 23 hand-compiled reference routes fall out this way, e.g. CLT–HNL, ORD–OGG, CLT/LAX/MIA/LGA–HDN, PHL–BZN, SAN–JFK.
  - Tradeoff: a domestic route launched after the data window won't appear until the next refresh.
  - International pairs aren't in the on-time data, so they keep reference estimates.

## How STANDBY presents historical data

- Times from history are labeled **"As flown · Mon YYYY"**, the BTS month they come from. That's the most recent same calendar month and weekday pattern, not this year's published schedule; for dates far ahead it can be more than a year old.
- Load factors cover flights operated by American, Envoy, PSA and Piedmont only. They appear as **"How full flights ran"**, e.g. "averaged 86% full in Nov 2025 (BTS T-100 monthly averages). Historical context only — not today's open seats." They feed one qualitative factor and, at 90% or above, one risk line. They never produce a probability, never claim seats are available, and never say a traveler will or won't clear.
- American's standby loads, priority lists and employee rules remain **unknown**. No source is connected.

## What history corrected in the reference network

Comparing the bundled reference network with as-flown BTS data for Jun 2025 – May 2026:

- **Seasons:** 56 directional routes had different operating months from the reference. Examples:
  - FLL–PHX flew Dec–May only.
  - SLC–LAX flew Dec–Apr only.
  - CLT–ABQ flew only in October, and LAX–SJC only in February.
- **Frequencies:** 85 of 538 November frequencies were off by 3+ flights a day. Examples: TPA–MIA estimated 4, actual 10; AUS–DFW estimated 10, actual 15.
- These figures were recomputed from the committed data. A month counts as "flown" when the median flights per day is at least 1 on some weekday within the operating span.
- **Partial-month seasons:** these are now modeled. DFW–HDN (Steamboat), for example, starts mid-December last year.

## Automated refresh (`.github/workflows/bts-history.yml`)

- **Monthly schedule (12th) or manual run, mode `latest`.** Requires the workflow to be on `main`; neither path has run yet.
  - Probes BTS for months after the dataset's last month and stops if nothing is new.
  - The job summary says "No new BTS month published after YYYY-MM".
  - If BTS can't be reached at all, the job fails with an error rather than reporting "no new data".
- **Manual run, mode `rebuild`:** rebuilds the current window.
- **Push to a feature branch that changes `scripts/bts/*.mjs`:** rebuilds and commits to that branch, so pipeline changes are reviewed with their data.
- **Never pushes to `main` by design.**
  - Scheduled and manual refreshes push a `data/bts-refresh-YYYY-MM` branch and open (or update) a PR. If the repository disallows Actions-created PRs, the summary links to a compare page instead.
  - Push-triggered runs refuse to push if the branch is `main`, and branch names and outputs reach the shell only through environment variables.
  - Note: `main` currently has no branch protection, so GitHub itself doesn't enforce review. Enabling a ruleset that requires a PR on `main` would close that gap.
- **Strict:**
  - a missing month fails the job;
  - fewer than 400 history routes or 300 load routes fails it;
  - a route count more than 20% below the previous dataset (either file) fails it.
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
