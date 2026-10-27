import { describe, expect, it } from "vitest";
import { americanAirlines } from "@/lib/airlines/american";
import { getDestination } from "@/lib/data/destinations";
import { createHistory, type HistoryFile } from "@/lib/providers/history";
import { createLoads, loadBand, type LoadsFile } from "@/lib/providers/loads";
import { providerStatuses } from "@/lib/providers/registry";
import { assessTrip } from "../assess";
import { defaultRequest } from "../discover";
import { ItineraryEngine } from "../itinerary";
import { buildPlan } from "../plan";
// @ts-expect-error — plain ESM build scripts without type declarations
import { decide, addMonths } from "../../../../scripts/bts/plan-refresh.mjs";
// @ts-expect-error — plain ESM build scripts without type declarations
import { aggregateMonth, toRoutes } from "../../../../scripts/bts/build-loads.mjs";

const party = { airline: "AA", mustTravelTogether: true, travelers: [] };
const all12 = Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, dataset: "marketing" as const }));

describe("seasonal start within a month", () => {
  const history = createHistory({
    meta: { source: "t", carrier: "AA", months: all12, failedMonths: [], generatedAt: "" },
    routes: { "DFW-HDN": { b: 159, m: { "12": { y: 2025, n: [2, 2, 2, 2, 2, 2, 2], s: [18, 31], t: [["09:00", "9999999"], ["14:00", "9999999"]] } }, r: { n: 60, cancel: 1, divert: 0, late15: 20, late30: 10, late60: 5 } } },
  } satisfies HistoryFile);
  it("has no service before last year's start date and normal service after", () => {
    expect(history.day("DFW", "HDN", "2026-12-10")!.times).toEqual([]);
    expect(history.day("DFW", "HDN", "2026-12-20")!.times).toEqual(["09:00", "14:00"]);
  });
});

describe("deadline handling in return fallbacks", () => {
  const engine = new ItineraryEngine(americanAirlines);
  it("says plainly when next-day flights home would land after the deadline", () => {
    // Return Nov 13, home by Nov 14. HNL→DFW takes ~8.5h, so Nov 14 departures land on the 15th.
    const request = { ...defaultRequest("2026-11-01", "DFW"), nights: 3, homeBy: "2026-11-14" };
    const destination = getDestination("honolulu")!;
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination, outboundDate: "2026-11-10" });
    expect(a.recovery.find((d) => d.date === "2026-11-14")!.depth).toBe(0);
    expect(a.factors.find((f) => f.key === "recovery")!.detail).toMatch(/no later flights land in time/);
    const plan = buildPlan({ engine, assessment: a, destination, request, allOrigins: a.origins });
    const next = plan.returnFallbacks.find((f) => f.kind === "next-day")!;
    expect(next.tone).toBe("caution");
    expect(next.title).toMatch(/won't get you home in time/);
  });
  it("counts only next-day flights that land by the deadline", () => {
    const request = { ...defaultRequest("2026-11-01", "DFW"), nights: 3, homeBy: "2026-11-14" };
    const destination = getDestination("cancun")!;
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination, outboundDate: "2026-11-10" });
    const plan = buildPlan({ engine, assessment: a, destination, request, allOrigins: a.origins });
    const day14 = a.recovery.find((d) => d.date === "2026-11-14")!;
    expect(day14.depth).toBeGreaterThan(0);
    expect(plan.returnFallbacks.find((f) => f.kind === "next-day")!.detail).toContain(`About ${day14.depth} attempts`);
  });
  it("explains a return date past the deadline instead of reporting missing service", () => {
    const request = { ...defaultRequest("2026-11-01", "DFW"), nights: 6, homeBy: "2026-11-14" };
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination: getDestination("cancun")!, outboundDate: "2026-11-10" });
    expect(a.tier).toBe("unavailable");
    expect(a.headline).toMatch(/after your deadline/);
  });
});

describe("refresh planning", () => {
  it("rolls forward to the newest published month", () => {
    const d = decide({ mode: "latest", end: "2026-05", current: "2026-10", publishedMonths: new Set(["2026-06", "2026-07"]) });
    expect(d).toMatchObject({ changed: true, from: "2025-08", to: "2026-07" });
  });
  it("reports no new data plainly", () => {
    const d = decide({ mode: "latest", end: "2026-05", current: "2026-10", publishedMonths: new Set() });
    expect(d.changed).toBe(false);
    expect(d.reason).toMatch(/No new BTS month/);
    expect(d.error).toBeUndefined();
  });
  it("treats an unreachable BTS as an error, not 'no new data'", () => {
    const d = decide({ mode: "latest", end: "2026-05", current: "2026-10", publishedMonths: new Set(), reachable: false });
    expect(d).toMatchObject({ changed: false, error: true });
  });
  it("rebuilds the existing window", () => {
    expect(decide({ mode: "rebuild", end: "2026-05", current: "2026-10", publishedMonths: new Set() })).toMatchObject({ changed: true, from: "2025-06", to: "2026-05" });
  });
  it("handles year boundaries", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
  });
});

describe("T-100 aggregation", () => {
  const header = '"DEPARTURES_SCHEDULED","DEPARTURES_PERFORMED","SEATS","PASSENGERS","UNIQUE_CARRIER","ORIGIN","DEST","YEAR","MONTH","CLASS",';
  const row = (deps: number, seats: number, pax: number, carrier: string, o: string, d: string, y: number, m: number, cls = "F") => `${deps},${deps},${seats},${pax},"${carrier}","${o}","${d}",${y},${m},"${cls}",`;
  const airports = new Set(["DFW", "ORD", "JAC", "LHR"]);
  it("keeps only AA-family scheduled passenger service with real capacity", () => {
    const csv = [header, row(298, 40000, 34000, "AA", "DFW", "ORD", 2026, 5), row(10, 700, 600, "MQ", "DFW", "ORD", 2026, 5), row(200, 30000, 29000, "UA", "DFW", "ORD", 2026, 5), row(3, 500, 400, "AA", "DFW", "ORD", 2026, 5, "L"), row(5, 0, 0, "AA", "DFW", "ORD", 2026, 5), row(120, 15000, 9000, "OO", "DFW", "ORD", 2026, 5)].join("\n");
    const { totals } = aggregateMonth(csv, airports);
    expect(toRoutes(totals)).toEqual({ "DFW-ORD": { "5": [85, 308, 2026] } });
  });
  it("drops routes with too few flights for a meaningful average and keeps international", () => {
    const csv = [header, row(4, 500, 450, "AA", "DFW", "JAC", 2026, 5), row(30, 9000, 8100, "AA", "DFW", "LHR", 2026, 5)].join("\n");
    expect(toRoutes(aggregateMonth(csv, airports).totals)).toEqual({ "DFW-LHR": { "5": [90, 30, 2026] } });
  });
  it("fails loudly when BTS renames a column", () => {
    expect(() => aggregateMonth('"SEATS","PAX"\n1,2', airports)).toThrow(/missing columns/);
  });
});

describe("load factors in assessments", () => {
  const loadsFile: LoadsFile = {
    meta: { source: "t", carriers: "AA", excluded: "", months: ["2025-11"], failedMonths: [], latestAvailable: "2026-07", generatedAt: "" },
    routes: { "DFW-ORD": { "11": [93, 360, 2025] }, "ORD-DFW": { "11": [78, 360, 2025] } },
  };
  const loads = createLoads(loadsFile);
  const engine = new ItineraryEngine(americanAirlines, undefined, loads);
  const request = { ...defaultRequest("2026-11-01", "DFW"), nights: 4 };
  const a = assessTrip({ airline: americanAirlines, engine, request, party, destination: getDestination("chicago")!, outboundDate: "2026-11-10" });

  it("adds a historical factor that never claims current availability", () => {
    const f = a.factors.find((x) => x.key === "loads")!;
    expect(f.basis).toBe("historical");
    expect(f.detail).toMatch(/93% full/);
    expect(f.detail).toMatch(/not today's open seats/);
    expect(f.detail).not.toMatch(/available seats|will clear|chance|probab/i);
  });
  it("flags very full routes as a risk, worded as history", () => {
    expect(a.risks.some((r) => /averaged 93% full in Nov 2025 — historically/.test(r))).toBe(true);
  });
  it("omits the factor rather than guessing when a route has no data", () => {
    const b = assessTrip({ airline: americanAirlines, engine, request, party, destination: getDestination("tokyo")!, outboundDate: "2026-11-10" });
    expect(b.factors.some((x) => x.key === "loads")).toBe(false);
  });
  it("bands load factors in plain language", () => {
    expect([70, 80, 87, 95].map(loadBand)).toEqual(["roomier", "typical", "full", "very-full"]);
  });
  it("lists T-100 as historical context in the data sources", () => {
    const t = providerStatuses({}).find((s) => s.id === "bts-t100")!;
    expect(t.detail).toMatch(/historical context/);
  });
});

describe("real BTS data: seasonal start", () => {
  it("has no Steamboat service before last year's mid-December start, and service after", async () => {
    const { readFileSync } = await import("node:fs");
    const history = createHistory(JSON.parse(readFileSync("public/data/aa-history.json", "utf8")));
    const engine = new ItineraryEngine(americanAirlines, history);
    const request = { ...defaultRequest("2026-12-01", "DFW"), nights: 4, allowAlternateDestinations: false };
    const before = assessTrip({ airline: americanAirlines, engine, request, party, destination: getDestination("steamboat")!, outboundDate: "2026-12-10" });
    const after = assessTrip({ airline: americanAirlines, engine, request, party, destination: getDestination("steamboat")!, outboundDate: "2026-12-21" });
    expect(before.tier).toBe("unavailable");
    expect(after.tier).not.toBe("unavailable");
    expect(after.outbound.itineraries.some((i) => i.legs.length === 1 && i.basis === "historical")).toBe(true);
  });
});

describe("data-refresh workflow safety", () => {
  it("never pushes to main and keeps expressions out of shell scripts", async () => {
    const { readFileSync } = await import("node:fs");
    const wf = readFileSync(".github/workflows/bts-history.yml", "utf8");
    // Every `git push` targets a feature/data branch via env vars; none can name main.
    const pushes = wf.split("\n").filter((l) => /git push/.test(l));
    expect(pushes.length).toBeGreaterThan(0);
    for (const l of pushes) {
      expect(l).not.toMatch(/\$\{\{/);
      expect(l).not.toMatch(/refs\/heads\/main|HEAD:main\b/);
    }
    expect(wf).toMatch(/Refusing to push to main/);
    expect(wf).toMatch(/branches-ignore: \[main/);
    // Inside `run:` blocks, GitHub expressions must not be spliced into shell.
    const runBlocks = [...wf.matchAll(/run: \|\n((?:\s{10}.*\n?)+)/g)].map((m) => m[1]);
    for (const block of runBlocks) expect(block).not.toMatch(/\$\{\{/);
    // Both builds run strict, so a partial dataset fails the job before anything is committed.
    expect(wf).toMatch(/build-history\.mjs[^\n]*--strict/);
    expect(wf).toMatch(/build-loads\.mjs[^\n]*--strict/);
  });
});
