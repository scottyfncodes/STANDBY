import { describe, expect, it } from "vitest";
import { americanAirlines } from "@/lib/airlines/american";
import { getDestination } from "@/lib/data/destinations";
import { adbConfigFromEnv, createAeroDataBox, dayWindows, fidsUrl, normalizeDepartures } from "@/lib/flightdata/aerodatabox";
import { getDepartures } from "@/lib/flightdata/registry";
import { LiveSchedule, type LiveDay } from "@/lib/providers/live";
import { assessTrip } from "../assess";
import { defaultRequest } from "../discover";
import { ItineraryEngine } from "../itinerary";
import { buildPlan } from "../plan";

/** A departure shaped like AeroDataBox's AirportFlightContract with withLeg=true (API v1.6). */
const flight = (o: { number: string; to: string; dep: [string, string]; arr: [string, string]; status?: string; airline?: string; codeshare?: string; revised?: string; cargo?: boolean }) => ({
  number: o.number,
  status: o.status ?? "Expected",
  codeshareStatus: o.codeshare ?? "IsOperator",
  isCargo: o.cargo ?? false,
  airline: { name: "American", iata: o.airline ?? "AA" },
  departure: { airport: { iata: "DFW" }, quality: ["Basic"], scheduledTime: { local: o.dep[0], utc: o.dep[1] }, ...(o.revised ? { revisedTime: { utc: o.revised, local: o.revised } } : {}) },
  arrival: { airport: { iata: o.to, timeZone: "America/Chicago" }, quality: ["Basic"], scheduledTime: { local: o.arr[0], utc: o.arr[1] } },
});

const morning = {
  departures: [
    flight({ number: "AA 1234", to: "ORD", dep: ["2026-11-10 06:05-06:00", "2026-11-10 12:05Z"], arr: ["2026-11-10 08:35-06:00", "2026-11-10 14:35Z"] }),
    flight({ number: "AA 2001", to: "ORD", dep: ["2026-11-10 09:10-06:00", "2026-11-10 15:10Z"], arr: ["2026-11-10 11:40-06:00", "2026-11-10 17:40Z"], status: "Canceled" }),
    flight({ number: "BA 1500", to: "ORD", dep: ["2026-11-10 06:05-06:00", "2026-11-10 12:05Z"], arr: ["2026-11-10 08:35-06:00", "2026-11-10 14:35Z"], airline: "BA", codeshare: "IsCodeshared" }),
    flight({ number: "UA 300", to: "ORD", dep: ["2026-11-10 07:00-06:00", "2026-11-10 13:00Z"], arr: ["2026-11-10 09:30-06:00", "2026-11-10 15:30Z"], airline: "UA" }),
    flight({ number: "AA 9999", to: "MIA", dep: ["2026-11-10 10:00-06:00", "2026-11-10 16:00Z"], arr: ["2026-11-10 13:50-05:00", "2026-11-10 18:50Z"], cargo: true }),
    flight({ number: "AA 77", to: "LHR", dep: ["2026-11-10 11:50-06:00", "2026-11-10 17:50Z"], arr: ["2026-11-11 07:00+00:00", "2026-11-11 07:00Z"], status: "Delayed", revised: "2026-11-10 18:30Z" }),
  ],
  arrivals: [],
};
const afternoon = {
  departures: [
    // Overlaps the morning window edge; must be de-duplicated.
    flight({ number: "AA 77", to: "LHR", dep: ["2026-11-10 11:50-06:00", "2026-11-10 17:50Z"], arr: ["2026-11-11 07:00+00:00", "2026-11-11 07:00Z"], status: "Delayed" }),
    flight({ number: "AA 1500", to: "ORD", dep: ["2026-11-10 18:20-06:00", "2026-11-11 00:20Z"], arr: ["2026-11-10 20:50-06:00", "2026-11-11 02:50Z"] }),
    flight({ number: "AA 1600", to: "ORD", dep: ["2026-11-10 21:30-06:00", "2026-11-11 03:30Z"], arr: ["2026-11-10 23:59-06:00", "2026-11-11 05:59Z"] }),
    flight({ number: "AA 1700", to: "LAX", dep: ["2026-11-10 13:00-06:00", "2026-11-10 19:00Z"], arr: ["2026-11-10 14:20-08:00", "2026-11-10 22:20Z"] }),
  ],
};

describe("AeroDataBox normalization", () => {
  const flights = normalizeDepartures(morning, { airport: "DFW", carrier: "AA" });
  it("keeps only the carrier's operating passenger flights", () => {
    expect(flights.map((f) => f.number)).toEqual(["1234", "2001", "77"]);
  });
  it("parses local and UTC times and maps statuses", () => {
    const f = flights[0]!;
    expect(f.scheduledDep.local).toEqual({ date: "2026-11-10", time: "06:05" });
    expect(f.scheduledDep.utc).toBe("2026-11-10T12:05:00.000Z");
    expect(f.scheduledArr.local).toEqual({ date: "2026-11-10", time: "08:35" });
    expect(flights[1]!.status).toBe("cancelled");
    expect(flights[2]!.status).toBe("delayed");
    expect(flights[2]!.latestDepUtc).toBe("2026-11-10T18:30:00.000Z");
  });
  it("keeps overnight arrivals on their real local date", () => {
    expect(flights[2]!.scheduledArr.local.date).toBe("2026-11-11");
  });
  it("filters by destination and tolerates junk", () => {
    expect(normalizeDepartures(morning, { airport: "DFW", carrier: "AA", to: "LHR" }).map((f) => f.number)).toEqual(["77"]);
    expect(normalizeDepartures(null, { airport: "DFW", carrier: "AA" })).toEqual([]);
    expect(normalizeDepartures({ departures: [{ number: "AA 1" }] }, { airport: "DFW", carrier: "AA" })).toEqual([]);
  });
});

describe("AeroDataBox requests", () => {
  const cfg = { apiKey: "k", marketplace: "apimarket" as const, maxDaysAhead: 30 };
  it("splits a day into two 12-hour windows", () => {
    expect(dayWindows("2026-11-10")).toEqual([
      ["2026-11-10T00:00", "2026-11-10T11:59"],
      ["2026-11-10T12:00", "2026-11-10T23:59"],
    ]);
  });
  it("builds marketplace URLs with operating-flight filters", () => {
    const u = new URL(fidsUrl(cfg, "DFW", "2026-11-10T00:00", "2026-11-10T11:59"));
    expect(u.origin + u.pathname).toBe("https://prod.api.market/api/v1/aedbx/aerodatabox/flights/airports/iata/DFW/2026-11-10T00:00/2026-11-10T11:59");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ direction: "Departure", withLeg: "true", withCodeshared: "false", withCargo: "false" });
    expect(fidsUrl({ ...cfg, marketplace: "rapidapi" }, "DFW", "a", "b")).toMatch(/^https:\/\/aerodatabox\.p\.rapidapi\.com\/flights\/airports\/iata\/DFW\/a\/b\?/);
  });
  it("reads config from env with safe defaults", () => {
    expect(adbConfigFromEnv({})).toBeUndefined();
    expect(adbConfigFromEnv({ AERODATABOX_API_KEY: " k " })).toEqual({ apiKey: "k", marketplace: "apimarket", maxDaysAhead: 30 });
    expect(adbConfigFromEnv({ AERODATABOX_API_KEY: "k", AERODATABOX_MARKETPLACE: "RapidAPI", AERODATABOX_MAX_DAYS_AHEAD: "7" })).toMatchObject({ marketplace: "rapidapi", maxDaysAhead: 7 });
    expect(adbConfigFromEnv({ AERODATABOX_API_KEY: "k", AERODATABOX_MAX_DAYS_AHEAD: "9999" })!.maxDaysAhead).toBe(30);
  });

  const now = () => new Date("2026-11-08T15:00:00Z");
  it("fetches both windows with the right headers and returns live, de-duplicated flights", async () => {
    const calls: { url: string; headers: Record<string, string>; revalidate?: number }[] = [];
    const fetcher = async (url: string, init: RequestInit & { next?: { revalidate?: number } }) => {
      calls.push({ url, headers: init.headers as Record<string, string>, revalidate: init.next?.revalidate });
      return new Response(JSON.stringify(calls.length === 1 ? morning : afternoon), { status: 200 });
    };
    const res = await createAeroDataBox(cfg, fetcher, now).departures!({ airport: "DFW", date: "2026-11-10", carrier: "AA" });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers).toEqual({ "x-api-market-key": "k" });
    expect(calls[0]!.revalidate).toBe(6 * 3600);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.provenance.kind).toBe("live");
      expect(res.data.map((f) => f.number)).toEqual(["1234", "2001", "77", "1700", "1500", "1600"]);
    }
  });
  it("uses a short cache for today's statuses", async () => {
    let revalidate: number | undefined;
    const fetcher = async (_u: string, init: RequestInit & { next?: { revalidate?: number } }) => {
      revalidate = init.next?.revalidate;
      return new Response(null, { status: 204 });
    };
    const res = await createAeroDataBox(cfg, fetcher, now).departures!({ airport: "DFW", date: "2026-11-08", carrier: "AA" });
    expect(revalidate).toBe(300);
    expect(res.ok && res.data).toEqual([]);
  });
  it("refuses dates outside the horizon without calling the provider", async () => {
    let called = false;
    const fetcher = async () => ((called = true), new Response("{}"));
    const far = await createAeroDataBox(cfg, fetcher, now).departures!({ airport: "DFW", date: "2026-12-20", carrier: "AA" });
    const past = await createAeroDataBox(cfg, fetcher, now).departures!({ airport: "DFW", date: "2026-11-01", carrier: "AA" });
    expect(called).toBe(false);
    expect(!far.ok && far.reason).toBe("unsupported");
    expect(!far.ok && far.detail).toMatch(/next 30 days/);
    expect(!past.ok && past.reason).toBe("unsupported");
  });
  it("maps provider failures to explicit, non-fabricated results", async () => {
    const withStatus = (status: number) => async () => new Response("x", { status });
    const run = (status: number) => createAeroDataBox(cfg, withStatus(status), now).departures!({ airport: "DFW", date: "2026-11-10", carrier: "AA" });
    expect(await run(401)).toMatchObject({ ok: false, reason: "not_configured" });
    expect(await run(403)).toMatchObject({ ok: false, reason: "not_configured" });
    expect(await run(429)).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(await run(500)).toMatchObject({ ok: false, reason: "unavailable" });
    const thrown = await createAeroDataBox(cfg, async () => Promise.reject(new Error("ECONNRESET")), now).departures!({ airport: "DFW", date: "2026-11-10", carrier: "AA" });
    expect(thrown).toMatchObject({ ok: false, reason: "unavailable" });
  });
  it("never leaks the key into URLs or results", async () => {
    const urls: string[] = [];
    const res = await createAeroDataBox({ ...cfg, apiKey: "SECRET-KEY" }, async (u) => (urls.push(u), new Response(JSON.stringify(morning))), now).departures!({ airport: "DFW", date: "2026-11-10", carrier: "AA" });
    expect(urls.join(" ")).not.toContain("SECRET-KEY");
    expect(JSON.stringify(res)).not.toContain("SECRET-KEY");
  });
  it("is used through the provider chain", async () => {
    const provider = createAeroDataBox(cfg, async () => new Response(JSON.stringify(morning)), now);
    const res = await getDepartures({ airport: "DFW", date: "2026-11-09", carrier: "AA" }, [provider]);
    expect(res.ok).toBe(true);
  });
});

describe("live schedule in the engine", () => {
  const day = (flights = normalizeDepartures({ departures: [...morning.departures, ...afternoon.departures] }, { airport: "DFW", carrier: "AA" })): LiveDay => ({
    airport: "DFW",
    date: "2026-11-10",
    flights,
    provenance: { kind: "live", source: "AeroDataBox (test)", asOf: "2026-11-08T15:00:00Z" },
  });

  it("uses published times and flight numbers, and drops cancelled flights", () => {
    const engine = new ItineraryEngine(americanAirlines, undefined, undefined, new LiveSchedule([day()]));
    const deps = engine.departures("DFW", "ORD", "2026-11-10");
    expect(deps.map((d) => [d.depLocal.time, d.flight, d.basis])).toEqual([
      ["06:05", "AA 1234", "live"],
      ["18:20", "AA 1500", "live"],
      ["21:30", "AA 1600", "live"],
    ]);
    expect(deps[0]!.blockMin).toBe(150);
    expect(deps[0]!.routeDaily).toBe(3);
  });
  it("treats a well-covered airport-day with no flights to a city as no service", () => {
    const engine = new ItineraryEngine(americanAirlines, undefined, undefined, new LiveSchedule([day()]));
    expect(engine.departures("DFW", "CUN", "2026-11-10")).toEqual([]);
  });
  it("falls back when coverage is too thin to prove absence, or the day wasn't fetched", () => {
    const thin = day(normalizeDepartures(morning, { airport: "DFW", carrier: "AA", to: "LHR" }));
    const engine = new ItineraryEngine(americanAirlines, undefined, undefined, new LiveSchedule([thin]));
    expect(engine.departures("DFW", "CUN", "2026-11-10").every((d) => d.basis === "estimate")).toBe(true);
    expect(engine.departures("DFW", "ORD", "2026-11-11").every((d) => d.basis === "estimate")).toBe(true);
  });
  it("labels a connection only as verified as its weakest leg and names the flight in Plan A", () => {
    const engine = new ItineraryEngine(americanAirlines, undefined, undefined, new LiveSchedule([day()]));
    const request = { ...defaultRequest("2026-11-08", "DFW"), nights: 3 };
    const destination = getDestination("chicago")!;
    const a = assessTrip({ airline: americanAirlines, engine, request, party: { airline: "AA", mustTravelTogether: true, travelers: [] }, destination, outboundDate: "2026-11-10" });
    const plan = buildPlan({ engine, assessment: a, destination, request, allOrigins: a.origins });
    expect(plan.firstAttempt!.legs[0]!.flight).toBe("AA 1234");
    expect(plan.primaryOut!.basis).toBe("live");
    const viaLax = engine.itineraries("DFW", "SFO", "2026-11-10").find((i) => i.via === "LAX");
    if (viaLax) expect(viaLax.basis).toBe("estimate"); // LAX→SFO wasn't fetched
  });
});
