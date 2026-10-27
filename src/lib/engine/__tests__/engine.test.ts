import { describe, expect, it } from "vitest";
import { americanAirlines } from "@/lib/airlines/american";
import type { AirlineAdapter } from "@/lib/airlines/types";
import { getDestination } from "@/lib/data/destinations";
import type { TripRequest } from "@/lib/domain/types";
import { assessParty, type Party } from "@/lib/eligibility/party";
import { createStaticNetwork } from "@/lib/providers/network";
import { assessTrip } from "../assess";
import { assessDemand, easter } from "../calendar";
import { candidateDates, compareDates, defaultRequest, discover } from "../discover";
import { dayOptions, ItineraryEngine, representativeSlots } from "../itinerary";
import { buildPlan, buildReturnPlan } from "../plan";

const party: Party = {
  airline: "AA",
  mustTravelTogether: true,
  travelers: [
    { id: "a", name: "Alex", relationship: "parent", priority: { status: "unknown" } },
    { id: "b", name: "Sam", relationship: "parent", priority: { status: "unknown" } },
  ],
};

const req = (over: Partial<TripRequest> = {}): TripRequest => ({ ...defaultRequest("2027-01-10", "DFW"), ...over });

describe("itinerary engine", () => {
  const engine = new ItineraryEngine(americanAirlines);

  it("spreads representative slots across the day", () => {
    const s = representativeSlots("DFW", "ORD", 12);
    expect(s).toHaveLength(12);
    expect(s[0]).toBe("06:00");
    expect(s[11]).toBe("21:30");
  });

  it("uses evening departures for transatlantic eastbound flights", () => {
    const [slot] = representativeSlots("DFW", "LHR", 1);
    expect(slot! >= "16:30" && slot! <= "21:30").toBe(true);
  });

  it("computes arrivals in the destination's local time and flags overnight long-haul", () => {
    const [d] = engine.departures("DFW", "LHR", "2027-02-10");
    expect(d).toBeDefined();
    expect(d!.arrLocal.date).toBe("2027-02-11");
    const it0 = engine.itineraries("DFW", "LHR", "2027-02-10")[0]!;
    expect(it0.arrivesLaterDay).toBe(true);
  });

  it("respects seasonal routes", () => {
    expect(engine.departures("DFW", "HDN", "2027-01-15").length).toBeGreaterThan(0);
    expect(engine.departures("DFW", "HDN", "2027-07-15")).toHaveLength(0);
  });

  it("builds one-stop connections through hubs with a minimum buffer", () => {
    const its = engine.itineraries("AUS", "EYW", "2027-02-10");
    const connecting = its.filter((i) => i.via);
    expect(connecting.length).toBeGreaterThan(0);
    for (const i of connecting) {
      expect(i.legs[1]!.depUtc - i.legs[0]!.arrUtc).toBeGreaterThanOrEqual(60 * 60_000);
    }
  });

  it("requires a longer buffer when connecting after entering the US", () => {
    const its = engine.itineraries("CUN", "BNA", "2027-02-10").filter((i) => i.via);
    expect(its.length).toBeGreaterThan(0);
    for (const i of its) expect(i.legs[1]!.depUtc - i.legs[0]!.arrUtc).toBeGreaterThanOrEqual(120 * 60_000);
  });

  it("skips connections when nonstop-only", () => {
    const d = dayOptions(engine, ["AUS"], ["EYW"], "2027-02-10", false);
    expect(d.depth).toBe(0);
  });
});

describe("calendar demand", () => {
  it("computes Easter correctly", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
  });
  it("flags Thanksgiving week as peak", () => {
    expect(assessDemand("2026-11-25").level).toBe("peak");
  });
  it("never claims a holiday Tuesday is light", () => {
    const d = assessDemand("2026-12-22");
    expect(d.signals.some((s) => s.text.includes("Tuesdays"))).toBe(false);
  });
  it("labels day-of-week effects as general patterns", () => {
    const d = assessDemand("2027-02-02");
    const dow = d.signals.find((s) => s.text.includes("Tuesday"));
    expect(dow?.basis).toBe("general");
  });
  it("includes destination events like Mardi Gras", () => {
    const nola = getDestination("new-orleans")!;
    // Fat Tuesday 2027 is Feb 9.
    expect(assessDemand("2027-02-05", nola).signals.some((s) => s.text.startsWith("Mardi Gras"))).toBe(true);
  });
});

describe("eligibility", () => {
  it("never assumes unknown priority is shared", () => {
    const a = assessParty(party);
    expect(a.prioritiesKnown).toBe(false);
    expect(a.mixedPriority).toBe("unknown");
    expect(a.notes.join(" ")).toMatch(/doesn't assume/);
  });
  it("detects mixed known priorities", () => {
    const a = assessParty({
      ...party,
      travelers: [
        { id: "e", name: "E", relationship: "employee", priority: { status: "user", value: "D1" } },
        { id: "s", name: "S", relationship: "buddy-pass", priority: { status: "user", value: "D3" } },
      ],
    });
    expect(a.mixedPriority).toBe(true);
  });
  it("gets harder with more seats", () => {
    expect(assessParty(party, 4).strain).toBeGreaterThan(assessParty(party, 1).strain);
  });
});

describe("trip assessment", () => {
  const engine = new ItineraryEngine(americanAirlines);

  it("rates a deep nonstop market above a once-daily long-haul", () => {
    const r = req({ homeBy: "2027-02-20" });
    const cun = assessTrip({ airline: americanAirlines, engine, request: r, party, destination: getDestination("cancun")!, outboundDate: "2027-02-09" });
    const hnd = assessTrip({ airline: americanAirlines, engine, request: r, party, destination: getDestination("tokyo")!, outboundDate: "2027-02-09" });
    expect(cun.rank).toBeGreaterThan(hnd.rank);
    expect(hnd.factors.find((f) => f.key === "weakest-link")!.impact).toBe("hurts");
  });

  it("downgrades thin service when the return lands on the deadline day", () => {
    const tokyo = getDestination("tokyo")!;
    const tight = assessTrip({ airline: americanAirlines, engine, request: req({ nights: 5, homeBy: "2027-02-14" }), party, destination: tokyo, outboundDate: "2027-02-09" });
    expect(tight.slackDays).toBe(0);
    expect(["limited", "high-risk"]).toContain(tight.tier);
    expect(tight.risks.join(" ")).toMatch(/No buffer/);
  });

  it("marks out-of-season service as unavailable rather than inventing flights", () => {
    const a = assessTrip({ airline: americanAirlines, engine, request: req(), party, destination: getDestination("steamboat")!, outboundDate: "2027-07-10" });
    expect(a.tier === "unavailable" || a.outbound.itineraries.every((i) => !i.destination.startsWith("HDN"))).toBe(true);
  });

  it("reports insufficient evidence for airports outside the network", () => {
    const a = assessTrip({ airline: americanAirlines, engine, request: req({ origins: ["XXX"] }), party, destination: getDestination("cancun")!, outboundDate: "2027-02-09" });
    expect(a.tier).toBe("insufficient");
  });

  it("never exposes a probability", () => {
    const a = assessTrip({ airline: americanAirlines, engine, request: req(), party, destination: getDestination("london")!, outboundDate: "2027-02-09" });
    expect(JSON.stringify(a.factors)).not.toMatch(/%/);
    expect(a.headline).not.toMatch(/%/);
  });
});

describe("return-home planning", () => {
  const engine = new ItineraryEngine(americanAirlines);
  it("keeps reserve attempts before the deadline", () => {
    const request = req({ homeBy: "2027-02-15", risk: "cautious" });
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination: getDestination("cancun")!, outboundDate: "2027-02-09" });
    const plan = buildReturnPlan(a, request);
    expect(plan.reserve).toBe(4);
    expect(plan.latestSensible).toBeDefined();
    const all = a.recovery.flatMap((d) => d.itineraries.filter((i) => !i.overnightConnection));
    const after = all.filter((i) => i.depUtc > plan.latestSensible!.depUtc);
    expect(after.length).toBeGreaterThanOrEqual(4);
  });
  it("flags high deadline risk on thin return service", () => {
    const request = req({ nights: 5, homeBy: "2027-02-14", risk: "balanced" });
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination: getDestination("bermuda")!, outboundDate: "2027-02-09" });
    const plan = buildReturnPlan(a, request);
    expect(["high", "moderate"]).toContain(plan.deadlineRisk);
  });
  it("reports no-deadline when none set", () => {
    const request = req();
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination: getDestination("cancun")!, outboundDate: "2027-02-09" });
    expect(buildReturnPlan(a, request).deadlineRisk).toBe("no-deadline");
  });
});

describe("fallback engine", () => {
  const engine = new ItineraryEngine(americanAirlines);
  it("offers later flights, other hubs and alternate airports, ranked by usefulness", () => {
    const request = req({ origins: ["AUS"], useAlternateOrigins: true, homeBy: "2027-02-20" });
    const destination = getDestination("guanacaste")!;
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination, outboundDate: "2027-02-09" });
    const plan = buildPlan({ engine, assessment: a, destination, request, allOrigins: a.origins });
    const kinds = plan.outboundFallbacks.map((f) => f.kind);
    expect(kinds).toContain("other-hub");
    expect(kinds).toContain("alt-destination");
    expect(kinds).toContain("next-day");
    const scores = plan.outboundFallbacks.map((f) => f.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });
  it("warns about stranding at a hub with thin onward service", () => {
    const request = req({ origins: ["AUS"] });
    const destination = getDestination("bermuda")!;
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination, outboundDate: "2027-02-09" });
    const plan = buildPlan({ engine, assessment: a, destination, request, allOrigins: a.origins });
    expect(plan.outboundFallbacks.some((f) => f.kind === "hub-overnight" && f.tone === "caution")).toBe(true);
  });
  it("marks next-day return as missing the deadline when there is no slack", () => {
    const request = req({ nights: 4, homeBy: "2027-02-13" });
    const destination = getDestination("cancun")!;
    const a = assessTrip({ airline: americanAirlines, engine, request, party, destination, outboundDate: "2027-02-09" });
    const plan = buildPlan({ engine, assessment: a, destination, request, allOrigins: a.origins });
    const nd = plan.returnFallbacks.find((f) => f.kind === "next-day");
    expect(nd?.detail).toMatch(/miss your return deadline/);
  });
});

describe("dates and discovery", () => {
  it("excludes departures that would return after the deadline", () => {
    const { dates, excluded } = candidateDates(req({ windowStart: "2027-02-01", windowEnd: "2027-02-10", nights: 4, homeBy: "2027-02-11" }));
    expect(dates.at(-1)).toBe("2027-02-07");
    expect(excluded).toHaveLength(3);
  });
  it("ranks dates and explains each", () => {
    const engine = new ItineraryEngine(americanAirlines);
    const c = compareDates({ airline: americanAirlines, engine, request: req({ windowStart: "2026-11-20", windowEnd: "2026-12-05" }), party, destination: getDestination("cancun")!, maxDates: 30 });
    expect(c.options.length).toBeGreaterThan(5);
    const thanksgiving = c.options.find((o) => o.date === "2026-11-25")!;
    const later = c.options.find((o) => o.date === "2026-12-02")!;
    expect(later.rank).toBeGreaterThan(thanksgiving.rank);
    expect(thanksgiving.reasons.join(" ")).toMatch(/Thanksgiving/);
  });
  it("discovers ranked destinations quickly and honors scope", () => {
    const t0 = performance.now();
    const out = discover(americanAirlines, req({ scope: "international", climates: ["warm", "hot"], interests: ["beach"] }), party);
    const ms = performance.now() - t0;
    expect(out.results.length).toBeGreaterThan(3);
    expect(out.results.every((r) => r.destination.airports[0] !== "MIA")).toBe(true);
    expect(out.results[0]!.destination.interests).toContain("beach");
    expect(ms).toBeLessThan(4000);
    console.log(`discover: ${ms.toFixed(0)}ms, ${out.results.length} results, top: ${out.results.slice(0, 5).map((r) => r.destination.name).join(", ")}`);
  });
});

describe("multi-airline architecture", () => {
  it("runs the same engine against a different airline adapter", () => {
    const fake: AirlineAdapter = {
      ...americanAirlines,
      code: "ZZ",
      name: "Test Air",
      hubs: ["DEN"],
      network: createStaticNetwork("zz", [{ a: "DEN", b: "BZN", daily: 3, blockMin: 90 }, { a: "AUS", b: "DEN", daily: 4, blockMin: 140 }], americanAirlines.network.provenance),
    };
    const engine = new ItineraryEngine(fake);
    const its = engine.itineraries("AUS", "BZN", "2027-02-10");
    expect(its.length).toBeGreaterThan(0);
    expect(its.every((i) => i.via === "DEN")).toBe(true);
  });
});
