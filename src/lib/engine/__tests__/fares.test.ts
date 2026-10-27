import { describe, expect, it } from "vitest";
import { getFares, validateFares } from "@/lib/fares/registry";
import { createSerpApiFares, normalizeFares, serpApiConfigFromEnv, serpApiUrl } from "@/lib/fares/serpapi";
import type { FareQuery } from "@/lib/fares/types";
import { providerStatuses } from "@/lib/providers/registry";

// Shaped like SerpApi's Google Flights one-way response (engine=google_flights, type=2).
const seg = (fn: string, airline: string, from: string, dep: string, to: string, arr: string) => ({
  departure_airport: { name: from, id: from, time: dep },
  arrival_airport: { name: to, id: to, time: arr },
  duration: 120,
  airline,
  travel_class: "Economy",
  flight_number: fn,
});
const FIXTURE = {
  search_metadata: { status: "Success", google_flights_url: "https://www.google.com/travel/flights?hl=en&gl=us&curr=USD&tfs=abc" },
  search_parameters: { engine: "google_flights", type: "2", departure_id: "MIA,FLL", arrival_id: "DFW", outbound_date: "2026-11-11" },
  best_flights: [
    { flights: [seg("AA 1226", "American", "MIA", "2026-11-11 05:10", "DFW", "2026-11-11 07:35")], total_duration: 205, price: 139, type: "One way" },
    { flights: [seg("NK 410", "Spirit", "FLL", "2026-11-11 06:00", "DFW", "2026-11-11 08:20")], total_duration: 200, price: 79, type: "One way" },
  ],
  other_flights: [
    { flights: [seg("AA 2607", "American", "MIA", "2026-11-11 07:01", "CLT", "2026-11-11 09:00"), seg("AA 1800", "American", "CLT", "2026-11-11 10:00", "DFW", "2026-11-11 12:00")], total_duration: 359, price: 118, type: "One way" },
    // Codeshare-style mix: not "on American" end to end.
    { flights: [seg("AA 9000", "American", "MIA", "2026-11-11 08:00", "ATL", "2026-11-11 10:00"), seg("DL 100", "Delta", "ATL", "2026-11-11 11:00", "DFW", "2026-11-11 12:30")], total_duration: 330, price: 95, type: "One way" },
    // No price: ignored.
    { flights: [seg("AA 3117", "American", "MIA", "2026-11-11 16:45", "DFW", "2026-11-11 19:15")], total_duration: 210, type: "One way" },
    // Departs the next day (late search spillover): ignored.
    { flights: [seg("AA 1", "American", "MIA", "2026-11-12 00:30", "DFW", "2026-11-12 02:30")], total_duration: 120, price: 60, type: "One way" },
  ],
  price_insights: { lowest_price: 79, price_level: "low", typical_price_range: [90, 220], price_history: [[1793000000, 120]] },
};
const Q: FareQuery = { from: ["MIA", "FLL"], to: ["DFW"], date: "2026-11-11", airline: "AA" };
const NOW = () => new Date("2026-10-27T15:00:00Z");
const CFG = { apiKey: "secret-key-123", maxDaysAhead: 330 };

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit & { next?: { revalidate?: number } } }[] = [];
  const fn = async (url: string, init: RequestInit & { next?: { revalidate?: number } }) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { fn, calls };
}

describe("SerpApi fare normalization", () => {
  it("finds the cheapest fare overall and the cheapest flown entirely on the user's airline", () => {
    const q = normalizeFares(FIXTURE, Q);
    expect(q.cheapest).toMatchObject({ price: 79, flights: ["NK 410"], airlines: ["NK"], airlineNames: ["Spirit"], from: "FLL", to: "DFW", stops: 0 });
    expect(q.cheapestOnAirline).toMatchObject({ price: 118, flights: ["AA 2607", "AA 1800"], stops: 1, durationMin: 359, dep: { date: "2026-11-11", time: "07:01" }, arr: { date: "2026-11-11", time: "12:00" } });
    expect(q.typicalRange).toEqual([90, 220]);
    expect(q.priceLevel).toBe("low");
    expect(q.searchUrl).toMatch(/^https:\/\/www\.google\.com\/travel\/flights/);
    expect(q.currency).toBe("USD");
  });

  it("tolerates missing sections and never invents a price", () => {
    const q = normalizeFares({ search_metadata: { status: "Success" } }, Q);
    expect(q.cheapest).toBeUndefined();
    expect(q.cheapestOnAirline).toBeUndefined();
    expect(q.typicalRange).toBeUndefined();
    expect(normalizeFares(null, Q).cheapest).toBeUndefined();
  });

  it("only links to Google Flights", () => {
    const q = normalizeFares({ ...FIXTURE, search_metadata: { google_flights_url: "https://evil.example/x" } }, Q);
    expect(q.searchUrl).toBeUndefined();
  });
});

describe("SerpApi requests", () => {
  it("builds a one-way economy search for one adult in USD with grouped airports", () => {
    const u = new URL(serpApiUrl(CFG, Q));
    expect(u.origin + u.pathname).toBe("https://serpapi.com/search.json");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ engine: "google_flights", type: "2", departure_id: "MIA,FLL", arrival_id: "DFW", outbound_date: "2026-11-11", travel_class: "1", adults: "1", currency: "USD", gl: "us", hl: "en" });
    expect(u.searchParams.has("include_airlines")).toBe(false);
  });

  it("reads config from env", () => {
    expect(serpApiConfigFromEnv({})).toBeUndefined();
    expect(serpApiConfigFromEnv({ SERPAPI_API_KEY: "  k  " })).toEqual({ apiKey: "k", maxDaysAhead: 330 });
  });

  it("makes one cached call and returns a live-provenance quote", async () => {
    const f = fakeFetch(200, FIXTURE);
    const r = await createSerpApiFares(CFG, f.fn, NOW).quote(Q);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.init.next?.revalidate).toBe(6 * 3600);
    expect(r.ok && r.data.cheapest?.price).toBe(79);
    expect(r.ok && r.provenance).toMatchObject({ kind: "live", source: "Google Flights via SerpApi", asOf: "2026-10-27T15:00:00.000Z" });
  });

  it("treats 'no results' as an empty answer, not a failure", async () => {
    const f = fakeFetch(200, { search_metadata: { status: "Success" }, error: "Google Flights hasn't returned any results for this query." });
    const r = await createSerpApiFares(CFG, f.fn, NOW).quote(Q);
    expect(r.ok).toBe(true);
    expect(r.ok && r.data.cheapest).toBeUndefined();
  });

  it("refuses past and far-future dates without spending a search", async () => {
    const f = fakeFetch(200, FIXTURE);
    const p = createSerpApiFares(CFG, f.fn, NOW);
    expect(await p.quote({ ...Q, date: "2026-10-01" })).toMatchObject({ ok: false, reason: "unsupported" });
    expect(await p.quote({ ...Q, date: "2027-12-01" })).toMatchObject({ ok: false, reason: "unsupported" });
    expect(f.calls).toHaveLength(0);
  });

  it("maps provider errors without leaking the key", async () => {
    const cases: [number, unknown, string][] = [
      [401, { error: "Invalid API key. Your API key should be here: https://serpapi.com/manage-api-key" }, "not_configured"],
      [403, { error: "Account deleted" }, "not_configured"],
      [429, { error: "Your account has run out of searches." }, "rate_limited"],
      [500, "<html>oops</html>", "unavailable"],
      [200, { search_metadata: { status: "Error" }, error: "Proxy timeout" }, "unavailable"],
    ];
    for (const [status, body, reason] of cases) {
      const r = await createSerpApiFares(CFG, fakeFetch(status, body).fn, NOW).quote(Q);
      expect(r).toMatchObject({ ok: false, reason });
      expect(JSON.stringify(r)).not.toContain(CFG.apiKey);
    }
    const thrown = await createSerpApiFares(CFG, async () => Promise.reject(new Error(`fetch failed ${serpApiUrl(CFG, Q)}`)), NOW).quote(Q);
    expect(thrown).toMatchObject({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(thrown)).not.toContain(CFG.apiKey);
  });
});

describe("fare registry", () => {
  it("validates queries", () => {
    expect(validateFares(Q)).toBeUndefined();
    expect(validateFares({ ...Q, from: ["ZZZ"] })).toBeDefined();
    expect(validateFares({ ...Q, to: [] })).toBeDefined();
    expect(validateFares({ ...Q, date: "11/11/2026" })).toBeDefined();
  });

  it("says not_configured, never a made-up fare, without a key", async () => {
    expect(await getFares(Q, undefined)).toMatchObject({ ok: false, reason: "not_configured" });
  });

  it("caches successful quotes per query", async () => {
    let n = 0;
    const p = { label: "test", quote: async () => (n++, createSerpApiFares(CFG, fakeFetch(200, FIXTURE).fn, NOW).quote(Q)) };
    const q = { ...Q, date: "2026-11-20" };
    const a = await getFares(q, p);
    const b = await getFares(q, p);
    expect(n).toBe(1);
    expect(a.ok && a.cached).toBe(false);
    expect(b.ok && b.cached).toBe(true);
  });

  it("reports fares as connected only when a key is configured", () => {
    expect(providerStatuses({ SERPAPI_API_KEY: "x" }).find((x) => x.id === "fares")!.state).toBe("connected");
    expect(providerStatuses({}).find((x) => x.id === "fares")!.state).toBe("not_configured");
  });
});
