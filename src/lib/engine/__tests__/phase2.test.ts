import { describe, expect, it } from "vitest";
import { americanAirlines } from "@/lib/airlines/american";
import { getDestination } from "@/lib/data/destinations";
import { RateLimiter, TtlCache } from "@/lib/flightdata/cache";
import { getDepartures } from "@/lib/flightdata/registry";
import type { FlightDataProvider } from "@/lib/flightdata/types";
import { createHistory, type HistoryFile } from "@/lib/providers/history";
import { assessTrip } from "../assess";
import { defaultRequest } from "../discover";
import { arrivingBy, dayOptions, ItineraryEngine, resilienceNotes, summarizePaths } from "../itinerary";
import { buildReturnPlan } from "../plan";
// @ts-expect-error — plain ESM build script without type declarations
import { mergeShiftedTimes } from "../../../../scripts/bts/build-history.mjs";

const all12 = Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, dataset: "marketing" as const }));
const fixture: HistoryFile = {
  meta: { source: "test", carrier: "AA", months: all12, failedMonths: [], generatedAt: "2026-01-01" },
  routes: {
    // Nov: 3 flights Mon–Fri, 2 on weekends (the 20:15 doesn't run Sat/Sun).
    "AUS-CLT": { b: 170, m: { "11": { y: 2025, n: [2, 3, 3, 3, 3, 3, 2], t: [["06:05", "9999999"], ["11:40", "9999999"], ["20:15", "0999990"]] } }, r: { n: 900, cancel: 2, divert: 0.5, late15: 30, late30: 22, late60: 10 } },
    "CLT-EYW": { b: 139, m: { "11": { y: 2025, n: [3, 3, 3, 3, 3, 3, 3], t: [["09:40", "9999999"], ["15:35", "9999999"], ["19:50", "9999999"]] } }, r: { n: 800, cancel: 2, divert: 1, late15: 18, late30: 12, late60: 6 } },
    // Seasonal: only flies December.
    "DFW-HDN": { b: 159, m: { "12": { y: 2025, n: [2, 2, 2, 2, 2, 2, 2], t: [["09:00", "9999999"], ["14:00", "9999999"]] } }, r: { n: 120, cancel: 2, divert: 1, late15: 40, late30: 30, late60: 15 } },
  },
};
const history = createHistory(fixture);

describe("historical schedules", () => {
  it("uses the weekday's typical count and most regular times", () => {
    expect(history.day("AUS", "CLT", "2026-11-04")!.times).toEqual(["06:05", "11:40", "20:15"]); // Wednesday
    expect(history.day("AUS", "CLT", "2026-11-08")!.times).toEqual(["06:05", "11:40"]); // Sunday
  });
  it("treats a month without service as a seasonal gap only when coverage is complete", () => {
    expect(history.day("DFW", "HDN", "2026-11-10")!.times).toEqual([]);
    const partial = createHistory({ ...fixture, meta: { ...fixture.meta, months: fixture.meta.months.map((m) => ({ ...m, dataset: "reporting" as const })) } });
    expect(partial.day("DFW", "HDN", "2026-11-10")).toBeUndefined();
  });
  it("falls back (undefined) for routes it has never seen", () => {
    expect(history.day("DFW", "LHR", "2026-11-10")).toBeUndefined();
  });
  it("labels the observed month", () => {
    expect(history.observedLabel(11)).toBe("Nov 2025");
  });
  it("merges mid-month time shifts into one flight", () => {
    const m = new Map([
      ["18:39", new Set(["2025-11-01", "2025-11-02"])],
      ["18:45", new Set(["2025-11-20", "2025-11-21", "2025-11-22"])],
      ["19:48", new Set(["2025-11-01", "2025-11-20"])],
    ]);
    const merged = mergeShiftedTimes(m) as [string, Set<string>][];
    expect(merged.map(([t]) => t)).toEqual(["18:45", "19:48"]);
    expect(merged[0]![1].size).toBe(5);
  });
});

describe("engine with history", () => {
  const engine = new ItineraryEngine(americanAirlines, history);

  it("prefers as-flown times and marks their basis", () => {
    const deps = engine.departures("AUS", "CLT", "2026-11-04");
    expect(deps.map((d) => d.depLocal.time)).toEqual(["06:05", "11:40", "20:15"]);
    expect(deps.every((d) => d.basis === "historical")).toBe(true);
    expect(deps[0]!.blockMin).toBe(170);
  });
  it("keeps reference estimates for routes without history", () => {
    expect(engine.departures("DFW", "LHR", "2026-11-04").every((d) => d.basis === "estimate")).toBe(true);
  });
  it("respects historical seasonal gaps even when the reference network says the route flies", () => {
    expect(engine.departures("DFW", "HDN", "2026-12-10").length).toBe(2);
    expect(engine.departures("DFW", "HDN", "2026-11-10").length).toBe(0);
  });
  it("attaches historical misconnect evidence to connections", () => {
    const conn = engine.itineraries("AUS", "EYW", "2026-11-04").find((i) => i.via === "CLT")!;
    expect(conn.connectionRisk).toBeDefined();
    expect(conn.connectionRisk!.toleranceMin).toBe(conn.layoverMin! - 30);
    const notes = resilienceNotes(summarizePaths(dayOptions(engine, ["AUS"], ["EYW"], "2026-11-04", true)).find((p) => p.via === "CLT")!);
    expect(notes.some((n) => n.text.includes("arrived") && n.text.includes("late"))).toBe(true);
  });
});

describe("deadline arrival", () => {
  const engine = new ItineraryEngine(americanAirlines);
  it("drops attempts that land after the deadline day", () => {
    // HNL → mainland redeyes leave in the evening and land the next morning.
    const day = dayOptions(engine, ["HNL"], ["DFW"], "2026-11-10", true);
    expect(day.itineraries.some((i) => i.legs.at(-1)!.arrLocal.date > "2026-11-10")).toBe(true);
    const kept = arrivingBy(day, "2026-11-10");
    expect(kept.itineraries.every((i) => i.legs.at(-1)!.arrLocal.date <= "2026-11-10")).toBe(true);
    expect(kept.depth).toBeLessThan(day.depth);
  });
  it("never counts a post-deadline arrival as a way home", () => {
    const request = { ...defaultRequest("2026-11-01", "DFW"), nights: 4, homeBy: "2026-11-14" };
    const a = assessTrip({ airline: americanAirlines, engine, request, party: { airline: "AA", mustTravelTogether: true, travelers: [] }, destination: getDestination("honolulu")!, outboundDate: "2026-11-10" });
    for (const d of a.recovery) for (const i of d.itineraries) expect(i.legs.at(-1)!.arrLocal.date <= "2026-11-14").toBe(true);
    const plan = buildReturnPlan(a, request);
    if (plan.latestSensible) expect(plan.latestSensible.legs.at(-1)!.arrLocal.date <= "2026-11-14").toBe(true);
  });
});

describe("flight-data layer", () => {
  it("expires cached entries", () => {
    let now = 0;
    const c = new TtlCache<number>(1000, 10, () => now);
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    now = 1001;
    expect(c.get("a")).toBeUndefined();
  });
  it("rate-limits and refills", () => {
    let now = 0;
    const r = new RateLimiter(2, 60, () => now);
    expect(r.tryTake()).toBe(true);
    expect(r.tryTake()).toBe(true);
    expect(r.tryTake()).toBe(false);
    now = 1000;
    expect(r.tryTake()).toBe(true);
  });
  const q = { airport: "DFW", date: "2026-11-10", carrier: "AA" };
  it("reports not_configured instead of inventing flights", async () => {
    const res = await getDepartures(q, [{ id: "x", label: "X", capabilities: ["schedules"], configured: () => false, departures: async () => ({ ok: true, data: [], provenance: { kind: "live", source: "x" }, cached: false }) }]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("not_configured");
  });
  it("falls back to the next provider when one fails", async () => {
    const failing: FlightDataProvider = { id: "a", label: "A", capabilities: ["schedules"], configured: () => true, departures: async () => { throw new Error("down"); } };
    const working: FlightDataProvider = { id: "b", label: "B", capabilities: ["schedules"], configured: () => true, departures: async () => ({ ok: true, data: [], provenance: { kind: "live", source: "B" }, cached: false }) };
    const res = await getDepartures({ ...q, date: "2026-11-11" }, [failing, working]);
    expect(res.ok && res.provenance.source).toBe("B");
  });
  it("rejects invalid requests", async () => {
    const res = await getDepartures({ ...q, airport: "ZZZ" }, []);
    expect(!res.ok && res.reason).toBe("invalid_request");
  });
  it("explains that a key is needed when no provider is configured", async () => {
    const { configuredProviders } = await import("@/lib/flightdata/registry");
    const res = await getDepartures({ ...q, date: "2026-11-12" }, configuredProviders({}));
    expect(!res.ok && res.reason).toBe("not_configured");
    expect(!res.ok && res.detail).toMatch(/AeroDataBox needs an API key/);
  });
});

describe("primary destination airport", () => {
  it("plans Plan A into the primary airport and keeps alternates as backups", async () => {
    const { buildPlan } = await import("../plan");
    const engine = new ItineraryEngine(americanAirlines);
    const request = { ...defaultRequest("2026-11-01", "AUS"), nights: 4, homeBy: "2026-11-18" };
    const destination = getDestination("key-west")!;
    const a = assessTrip({ airline: americanAirlines, engine, request, party: { airline: "AA", mustTravelTogether: true, travelers: [] }, destination, outboundDate: "2026-11-11" });
    const plan = buildPlan({ engine, assessment: a, destination, request, allOrigins: a.origins });
    expect(plan.primaryOut!.destination).toBe("EYW");
    expect(plan.primaryBack!.origin).toBe("EYW");
    expect(plan.outboundFallbacks.some((f) => f.kind === "alt-destination")).toBe(true);
  });
});

describe("connections factor", () => {
  it("doesn't credit a nonstop to an alternate airport as a nonstop trip", () => {
    const engine = new ItineraryEngine(americanAirlines);
    const request = { ...defaultRequest("2026-11-01", "AUS"), nights: 4 };
    const a = assessTrip({ airline: americanAirlines, engine, request, party: { airline: "AA", mustTravelTogether: true, travelers: [] }, destination: getDestination("key-west")!, outboundDate: "2026-11-11" });
    const f = a.factors.find((x) => x.key === "connections")!;
    expect(f.detail).toMatch(/^EYW needs a connection/);
    expect(f.score).toBeLessThan(1);
  });
});
