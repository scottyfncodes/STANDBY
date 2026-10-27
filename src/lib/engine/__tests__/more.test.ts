import { describe, expect, it } from "vitest";
import { americanAirlines } from "@/lib/airlines/american";
import { decodeRequest, encodeRequest } from "@/lib/domain/query";
import { aggregateMonthly } from "@/lib/providers/climate";
import { providerStatuses } from "@/lib/providers/registry";
import { defaultRequest } from "../discover";
import { ItineraryEngine } from "../itinerary";

describe("hub overnights", () => {
  const engine = new ItineraryEngine(americanAirlines);
  it("flags a late departure that sits at the hub through the night", () => {
    const late = engine.itineraries("DFW", "ORD", "2026-11-03").filter((i) => i.via === "CLT").at(-1)!;
    expect(late.legs[0]!.depLocal.time >= "20:00").toBe(true);
    expect(late.overnightConnection).toBe(true);
  });
  it("does not treat a redeye with a morning connection as a hub overnight", () => {
    const fromHawaii = engine.itineraries("HNL", "CLT", "2026-11-03").filter((i) => i.via === "LAX");
    const redeye = fromHawaii.find((i) => i.legs[0]!.arrLocal.date > i.legs[0]!.depLocal.date && i.legs[0]!.arrLocal.time >= "05:00");
    expect(redeye).toBeDefined();
    expect(redeye!.overnightConnection).toBe(false);
  });
});

describe("search URL", () => {
  const defaults = defaultRequest("2026-11-01", "DFW");
  it("round-trips a full request", () => {
    const r = { ...defaults, origins: ["AUS", "SAT"], homeBy: "2026-12-10", scope: "international" as const, climates: ["warm" as const], interests: ["beach" as const, "food" as const], budget: 2 as const, complexity: "nonstop" as const, risk: "cautious" as const, allowAlternateDestinations: false, useAlternateOrigins: true };
    expect(decodeRequest(encodeRequest(r), defaults)).toEqual(r);
  });
  it("rejects invalid values without losing the rest", () => {
    const p = new URLSearchParams("o=dfw,xx,<script>&s=2026-02-30&e=2026-11-20&n=999&t=0&sc=moon&cl=warm,lava");
    const r = decodeRequest(p, defaults);
    expect(r.origins).toEqual(["DFW"]);
    expect(r.windowStart).toBe(defaults.windowStart);
    expect(r.windowEnd).toBe("2026-11-20");
    expect(r.nights).toBe(defaults.nights);
    expect(r.travelers).toBe(defaults.travelers);
    expect(r.scope).toBe("any");
    expect(r.climates).toEqual(["warm"]);
  });
  it("never lets the window end before it starts", () => {
    const r = decodeRequest(new URLSearchParams("o=DFW&s=2026-12-01&e=2026-11-01"), defaults);
    expect(r.windowEnd).toBe("2026-12-01");
  });
});

describe("climate aggregation", () => {
  it("averages highs and counts wet days per year by month", () => {
    const months = aggregateMonthly({
      daily: {
        time: ["2021-01-01", "2021-01-02", "2022-01-01", "2021-07-01"],
        temperature_2m_max: [70, 80, null, 90],
        precipitation_sum: [0, 5, 2, 0.2],
      },
    });
    const jan = months.find((m) => m.month === 1)!;
    expect(jan.avgHighF).toBe(75);
    expect(jan.wetDays).toBe(1); // 2 wet days over 2 years
    expect(months.find((m) => m.month === 7)!.wetDays).toBe(0);
    expect(months.find((m) => m.month === 3)).toBeUndefined();
  });
});

describe("provider honesty", () => {
  it("never reports standby loads, schedules or fares as connected", () => {
    const s = providerStatuses({});
    for (const id of ["aa-standby-loads", "schedules", "fares"]) {
      expect(s.find((x) => x.id === id)!.state).not.toBe("connected");
    }
  });
  it("reports live schedules as connected only when a key is configured", () => {
    expect(providerStatuses({ AERODATABOX_API_KEY: "x" }).find((x) => x.id === "schedules")!.state).toBe("connected");
    expect(providerStatuses({}).find((x) => x.id === "schedules")!.state).toBe("not_configured");
  });
  it("represents every unverified AA employee rule as unknown", () => {
    expect(americanAirlines.employeeRules.every((r) => r.value.status === "unknown")).toBe(true);
  });
});
