import type { AirlineAdapter } from "@/lib/airlines/types";
import { NEARBY_AIRPORTS } from "@/lib/data/airports";
import type { Destination } from "@/lib/data/destinations";
import type { AirportCode, DataProvenance, ISODate, RiskTolerance, TripRequest } from "@/lib/domain/types";
import { assessParty, type Party, type PartyAssessment } from "@/lib/eligibility/party";
import { assessDemand, type DemandAssessment, type DemandLevel } from "./calendar";
import { arrivingBy, dayOptions, summarizePaths, type DayOptions, type ItineraryEngine } from "./itinerary";
import { addDays, diffDays } from "./time";

export type Tier = "flexible" | "workable" | "limited" | "high-risk" | "unavailable" | "insufficient";

export const TIER_COPY: Record<Tier, { label: string; short: string }> = {
  flexible: { label: "More flexible options", short: "Flexible" },
  workable: { label: "Workable with backups", short: "Workable" },
  limited: { label: "Limited alternatives", short: "Limited" },
  "high-risk": { label: "High schedule risk", short: "High risk" },
  unavailable: { label: "No service on these dates", short: "No service" },
  insufficient: { label: "Insufficient evidence", short: "Unknown" },
};

export type Impact = "helps" | "neutral" | "hurts";

export interface Factor {
  key: string;
  label: string;
  detail: string;
  impact: Impact;
  /** 0 (bad) … 1 (good). Internal ranking only — never displayed as a probability. */
  score: number;
  weight: number;
  basis: DataProvenance["kind"];
}

export interface TripAssessment {
  tier: Tier;
  /** Internal ranking value 0–1. NOT a probability of clearing standby. */
  rank: number;
  headline: string;
  factors: Factor[];
  risks: string[];
  outbound: DayOptions;
  inbound: DayOptions;
  /** Return-day options from the planned return through the deadline. */
  recovery: DayOptions[];
  demandOut: DemandAssessment;
  demandBack: DemandAssessment;
  party: PartyAssessment;
  slackDays: number | null;
  origins: AirportCode[];
  destAirports: AirportCode[];
  homeAirports: AirportCode[];
  outboundDate: ISODate;
  returnDate: ISODate;
}

export interface AssessInput {
  airline: AirlineAdapter;
  engine: ItineraryEngine;
  request: TripRequest;
  party: Party;
  destination: Destination;
  outboundDate: ISODate;
}

const DEMAND_SCORE: Record<DemandLevel, number> = { lighter: 1, typical: 0.75, elevated: 0.45, peak: 0.15 };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Diminishing returns: the 3rd option matters far more than the 20th. */
export const depthScore = (n: number) => 1 - Math.exp(-n / 8);
const ALT_AIRPORT_WEIGHT = 0.35;

export function originSet(request: TripRequest): AirportCode[] {
  const base = request.origins.map((o) => o.toUpperCase());
  if (!request.useAlternateOrigins) return base;
  return [...new Set([...base, ...base.flatMap((o) => NEARBY_AIRPORTS[o] ?? [])])];
}

export function destinationAirports(dest: Destination, request: TripRequest): AirportCode[] {
  return request.allowAlternateDestinations ? dest.airports : dest.airports.slice(0, 1);
}

/** Recommended number of backup attempts to keep in reserve before a hard deadline. */
export const RESERVE_ATTEMPTS: Record<RiskTolerance, number> = { cautious: 4, balanced: 2, adventurous: 1 };

export function assessTrip(input: AssessInput): TripAssessment {
  const { airline, engine, request, party, destination, outboundDate } = input;
  const origins = originSet(request);
  const destAirports = destinationAirports(destination, request);
  const homeAirports = origins;
  const returnDate = addDays(outboundDate, request.nights);
  const allowConn = request.complexity !== "nonstop";

  const outbound = dayOptions(engine, origins, destAirports, outboundDate, allowConn);
  const slackDays = request.homeBy ? diffDays(returnDate, request.homeBy) : null;
  // Attempts home only count if they land by the end of the deadline day.
  const homeDay = (date: ISODate, dests: AirportCode[]) => {
    const d = dayOptions(engine, dests, homeAirports, date, allowConn);
    return request.homeBy ? arrivingBy(d, request.homeBy) : d;
  };
  const inbound = homeDay(returnDate, destAirports);
  const recoveryDays = slackDays === null ? 2 : Math.max(0, Math.min(slackDays, 4));
  const recovery = [inbound];
  for (let i = 1; i <= recoveryDays; i++) recovery.push(homeDay(addDays(returnDate, i), destAirports));

  const demandOut = assessDemand(outboundDate, destination);
  const demandBack = assessDemand(returnDate, destination);
  const partyA = assessParty(party, request.travelers);

  const servedOrigins = origins.filter((o) => airline.network.serves(o));
  const base = { outbound, inbound, recovery, demandOut, demandBack, party: partyA, slackDays, origins, destAirports, homeAirports, outboundDate, returnDate };

  if (!servedOrigins.length || !destAirports.some((d) => airline.network.serves(d))) {
    return { ...base, tier: "insufficient", rank: 0, headline: `${airline.name} reference data doesn't cover this airport pair.`, factors: [], risks: [] };
  }
  if (outbound.depth === 0 || inbound.depth === 0) {
    const which = outbound.depth === 0 ? "outbound" : "return";
    return {
      ...base,
      tier: "unavailable",
      rank: 0,
      headline: `No ${request.complexity === "nonstop" ? "nonstop " : ""}${which} service found in the reference network on these dates (it may be seasonal).`,
      factors: [],
      risks: [],
    };
  }

  // Alternate arrival airports count, but at a discount: they add ground transfer and complexity.
  const primaryDest = destAirports[0]!;
  const outPrimary = dayOptions(engine, origins, [primaryDest], outboundDate, allowConn);
  const inPrimary = homeDay(returnDate, [primaryDest]);
  const effOut = outPrimary.depth + ALT_AIRPORT_WEIGHT * (outbound.depth - outPrimary.depth);
  const effIn = inPrimary.depth + ALT_AIRPORT_WEIGHT * (inbound.depth - inPrimary.depth);
  const altNote = (all: number, primary: number) =>
    all > primary ? ` (${primary} at ${primaryDest}, ${all - primary} more via alternate airports)` : "";

  const scheduleBasis = (d: DayOptions): Factor["basis"] => (d.itineraries.length && d.itineraries.every((i) => i.basis === "historical") ? "historical" : "reference");

  const factors: Factor[] = [];
  const impact = (s: number): Impact => (s >= 0.66 ? "helps" : s >= 0.4 ? "neutral" : "hurts");
  const add = (f: Omit<Factor, "impact">) => factors.push({ ...f, impact: impact(f.score) });

  const destName = destAirports.join("/");
  add({
    key: "outbound-depth",
    label: "Ways in",
    detail: `About ${outbound.depth} flight${outbound.depth === 1 ? "" : "s"} into ${destName} you could try for on departure day${altNote(outbound.depth, outPrimary.depth)}${outbound.hubs.length ? `, via ${outbound.hubs.length} hub${outbound.hubs.length === 1 ? "" : "s"}` : ""}.`,
    score: depthScore(effOut),
    weight: 0.2,
    basis: scheduleBasis(outbound),
  });
  add({
    key: "return-depth",
    label: "Ways home",
    detail: `About ${inbound.depth} flight${inbound.depth === 1 ? "" : "s"} home you could try for on return day${altNote(inbound.depth, inPrimary.depth)}.`,
    score: depthScore(effIn),
    weight: 0.2,
    basis: scheduleBasis(inbound),
  });

  // The best path's thinnest leg, taking the worse of the two directions.
  const bestWeakest = (d: DayOptions) => Math.max(...d.itineraries.filter((i) => !i.overnightConnection).map((i) => i.weakestDaily));
  const weakest = Math.min(bestWeakest(outbound), bestWeakest(inbound));
  add({
    key: "weakest-link",
    label: "Thinnest link",
    detail:
      weakest <= 1
        ? "The best path relies on a once-a-day flight. Missing it usually costs a full day."
        : `The best path has at least ${weakest} flights a day on every leg.`,
    score: weakest <= 1 ? 0.15 : weakest === 2 ? 0.45 : weakest <= 4 ? 0.7 : 1,
    weight: 0.12,
    basis: "reference",
  });

  const recoveryAttempts = recovery.slice(1).reduce((s, d) => s + d.depth, 0);
  if (slackDays === null) {
    add({ key: "recovery", label: "Room before deadline", detail: "No hard return deadline set — extra days are available if the return slips.", score: 0.7, weight: 0.18, basis: "user" });
  } else {
    const reserve = RESERVE_ATTEMPTS[request.risk];
    const s = slackDays === 0 ? clamp(inbound.depth / (reserve * 4)) * 0.5 : clamp((inbound.depth + recoveryAttempts) / (reserve * 5));
    add({
      key: "recovery",
      label: "Room before deadline",
      detail:
        slackDays === 0
          ? `You return on your deadline day, so only that day's ${inbound.depth} attempt${inbound.depth === 1 ? "" : "s"} remain.`
          : `${slackDays} spare day${slackDays === 1 ? "" : "s"} before your deadline — about ${recoveryAttempts} more attempts home in the ${recoveryDays === 1 ? "next day" : `next ${recoveryDays} days`} alone.`,
      score: s,
      weight: 0.18,
      basis: "user",
    });
  }

  const demandScore = (DEMAND_SCORE[demandOut.level] + DEMAND_SCORE[demandBack.level]) / 2;
  const demandWords = demandOut.level === demandBack.level ? `${demandOut.level} demand both ways` : `${demandOut.level} going, ${demandBack.level} returning`;
  add({
    key: "demand",
    label: "Seasonal demand",
    detail: `Calendar patterns suggest ${demandWords}. General patterns only — not route-specific load data.`,
    score: demandScore,
    weight: 0.15,
    basis: "estimate",
  });

  add({
    key: "party",
    label: "Your party",
    detail:
      partyA.seatsNeeded === 1
        ? "One seat needed."
        : `${partyA.seatsNeeded} seats needed${party.mustTravelTogether ? " on the same flight" : ""}${partyA.prioritiesKnown ? "" : "; priority unknown"}.`,
    score: 1 - partyA.strain,
    weight: 0.07,
    basis: partyA.prioritiesKnown ? "user" : "unavailable",
  });

  const hasNonstop = outbound.nonstopCount > 0 && inbound.nonstopCount > 0;
  // Misconnect evidence for the most practical connecting path, when history is available.
  const bestConn = hasNonstop ? undefined : [...summarizePaths(outbound), ...summarizePaths(inbound)].find((p) => p.via && p.connectionRisk)?.connectionRisk;
  const connScore = hasNonstop ? 1 : (outbound.hubs.length >= 2 ? 0.6 : 0.4) - (bestConn ? Math.min(bestConn.lateShare, 40) / 200 : 0);
  add({
    key: "connections",
    label: "Connections",
    detail: hasNonstop
      ? "Nonstop service both ways — no connection to misconnect or get stranded at."
      : `Requires a connection${outbound.hubs.length ? ` (${outbound.hubs.slice(0, 3).join(", ")})` : ""}; each one is another standby list.${
          bestConn ? ` Historically ${bestConn.lateShare}% of first legs arrived ${bestConn.thresholdMin}+ min late.` : ""
        }`,
    score: Math.max(0.1, connScore),
    weight: 0.08,
    basis: bestConn ? "historical" : "reference",
  });

  let rank = factors.reduce((s, f) => s + f.score * f.weight, 0) / factors.reduce((s, f) => s + f.weight, 0);

  let tier: Tier = rank >= 0.82 ? "flexible" : rank >= 0.64 ? "workable" : rank >= 0.46 ? "limited" : "high-risk";
  // Hard rules: a once-daily link with no spare day is never "flexible".
  if (weakest <= 1 && (slackDays ?? 1) === 0) tier = inbound.depth <= 1 ? "high-risk" : worse(tier, "limited");
  if (inbound.depth <= 1 && (slackDays ?? 1) === 0) tier = "high-risk";
  if (tier === "high-risk") rank = Math.min(rank, 0.45);

  const risks = collectRisks({ outbound, inbound, slackDays, weakest, demandOut, demandBack, partyA });
  const top = factors.filter((f) => f.impact === "helps").sort((a, b) => b.score * b.weight - a.score * a.weight)[0];
  const low = factors.filter((f) => f.impact === "hurts").sort((a, b) => a.score * a.weight - b.score * b.weight)[0];
  const headline = [top?.detail, low ? `Watch: ${low.detail.charAt(0).toLowerCase()}${low.detail.slice(1)}` : undefined].filter(Boolean).join(" ");

  return { ...base, tier, rank, headline, factors, risks };
}

const ORDER: Tier[] = ["flexible", "workable", "limited", "high-risk"];
function worse(a: Tier, b: Tier): Tier {
  return ORDER.indexOf(a) > ORDER.indexOf(b) ? a : b;
}

function collectRisks(x: {
  outbound: DayOptions;
  inbound: DayOptions;
  slackDays: number | null;
  weakest: number;
  demandOut: DemandAssessment;
  demandBack: DemandAssessment;
  partyA: PartyAssessment;
}): string[] {
  const risks: string[] = [];
  // Only flag exposure that the practical options actually carry: if there are
  // plenty of nonstops, a theoretical late connection elsewhere isn't a real risk.
  const reliesOnConnections = (d: DayOptions) => d.nonstopCount < 2;
  const mostlyOvernight = (d: DayOptions) => {
    const same = d.itineraries.filter((i) => !i.overnightConnection);
    return same.length > 0 && same.filter((i) => i.arrivesLaterDay).length / same.length > 0.5;
  };
  if (x.inbound.depth <= 2) risks.push("Very few flights home on return day — the last flight of the day is a real cliff.");
  if (x.slackDays === 0) risks.push("No buffer: if the return doesn't clear, you miss your deadline.");
  if ((reliesOnConnections(x.outbound) && x.outbound.overnightExposure) || (reliesOnConnections(x.inbound) && x.inbound.overnightExposure))
    risks.push("Late connections can leave you overnight at a hub if you don't clear the second flight.");
  if (mostlyOvernight(x.outbound) || mostlyOvernight(x.inbound)) risks.push("Overnight or long-haul flights — a missed departure often means waiting until the next day's flight.");
  if (x.weakest <= 1 && x.inbound.depth > 2) risks.push("The best routing includes a once-a-day flight.");
  if (x.demandOut.level === "peak" || x.demandBack.level === "peak") risks.push("Peak-demand dates: standby lists are typically longest now.");
  if (x.partyA.seatsNeeded >= 3) risks.push(`Clearing ${x.partyA.seatsNeeded} together is harder than one or two.`);
  return risks;
}
