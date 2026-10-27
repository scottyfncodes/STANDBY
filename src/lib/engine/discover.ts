import type { AirlineAdapter } from "@/lib/airlines/types";
import { isDomestic } from "@/lib/data/airports";
import { DESTINATIONS, type Destination } from "@/lib/data/destinations";
import type { Climate, ISODate, TripRequest } from "@/lib/domain/types";
import type { Party } from "@/lib/eligibility/party";
import { assessTrip, destinationAirports, type TripAssessment } from "./assess";
import { DEMAND_LABEL } from "./calendar";
import { ItineraryEngine, type FlightHistory } from "./itinerary";
import { addDays, diffDays, eachDate, formatShortDate, monthOf } from "./time";

export interface DateOption {
  date: ISODate;
  returnDate: ISODate;
  assessment: TripAssessment;
  /** Combined date ranking (feasibility + demand), 0–1, internal. */
  rank: number;
  reasons: string[];
}

export interface DateComparison {
  options: DateOption[];
  excluded: { date: ISODate; reason: string }[];
}

/** Candidate departure dates honoring the window, trip length and deadline. */
export function candidateDates(request: TripRequest): { dates: ISODate[]; excluded: { date: ISODate; reason: string }[] } {
  const excluded: { date: ISODate; reason: string }[] = [];
  const dates: ISODate[] = [];
  if (request.windowEnd < request.windowStart) return { dates, excluded };
  for (const d of eachDate(request.windowStart, request.windowEnd)) {
    const ret = addDays(d, request.nights);
    if (request.homeBy && ret > request.homeBy) excluded.push({ date: d, reason: `Returning ${formatShortDate(ret)} would be after your deadline` });
    else dates.push(d);
  }
  return { dates, excluded };
}

function sample<T>(xs: T[], max: number): T[] {
  if (xs.length <= max) return xs;
  const step = (xs.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => xs[Math.round(i * step)]!);
}

export function compareDates(args: {
  airline: AirlineAdapter;
  engine: ItineraryEngine;
  request: TripRequest;
  party: Party;
  destination: Destination;
  maxDates?: number;
}): DateComparison {
  const { dates, excluded } = candidateDates(args.request);
  const options: DateOption[] = [];
  for (const date of sample(dates, args.maxDates ?? 60)) {
    const assessment = assessTrip({ ...args, outboundDate: date });
    if (assessment.tier === "unavailable" || assessment.tier === "insufficient") {
      excluded.push({ date, reason: assessment.headline });
      continue;
    }
    const reasons: string[] = [];
    const out = assessment.demandOut;
    const back = assessment.demandBack;
    reasons.push(`Out: ${DEMAND_LABEL[out.level].toLowerCase()}${out.signals[0] ? ` — ${out.signals[0].text}` : ""}`);
    reasons.push(`Back: ${DEMAND_LABEL[back.level].toLowerCase()}${back.signals[0] ? ` — ${back.signals[0].text}` : ""}`);
    if (assessment.slackDays !== null) reasons.push(assessment.slackDays === 0 ? "No spare days before your deadline" : `${assessment.slackDays} spare day${assessment.slackDays === 1 ? "" : "s"} before your deadline`);
    reasons.push(`~${assessment.outbound.depth} ways in, ~${assessment.inbound.depth} ways home`);
    options.push({ date, returnDate: assessment.returnDate, assessment, rank: assessment.rank, reasons });
  }
  options.sort((a, b) => b.rank - a.rank || a.date.localeCompare(b.date));
  excluded.sort((a, b) => a.date.localeCompare(b.date));
  return { options, excluded };
}

// ——— Preference fit

export function climateOf(dest: Destination, month: number): Climate[] {
  const high = dest.highF[month - 1]!;
  const out: Climate[] = [];
  if (dest.snowMonths?.includes(month)) out.push("snow");
  if (high >= 88) out.push("hot");
  else if (high >= 77) out.push("warm");
  else if (high >= 62) out.push("mild");
  else out.push("cool");
  return out;
}

export interface Fit {
  score: number;
  /** False only when the traveler asked for a climate this month doesn't offer. */
  climateMatch: boolean;
  reasons: string[];
  concerns: string[];
}

export function preferenceFit(dest: Destination, request: TripRequest, month: number): Fit {
  const reasons: string[] = [];
  const concerns: string[] = [];
  const high = dest.highF[month - 1]!;
  const climates = climateOf(dest, month);
  // Without a stated preference, favor comfortable weather (roughly 68–86°F highs, or snow season for ski towns).
  let climateScore = high >= 68 && high <= 86 ? 1 : climates.includes("snow") ? 0.7 : Math.max(0.15, 1 - Math.min(Math.abs(high - 68), Math.abs(high - 86)) / 25);
  let climateMatch = true;
  if (request.climates.length) {
    const hit = request.climates.some((c) => climates.includes(c) || (c === "warm" && climates.includes("hot")));
    climateMatch = hit;
    climateScore = hit ? 1 : 0.1;
    if (hit) reasons.push(climates.includes("snow") ? `Ski season (highs near ${high}°F)` : `Highs around ${high}°F`);
    else concerns.push(`Highs around ${high}°F — not the climate you asked for`);
  } else {
    reasons.push(`Highs around ${high}°F`);
  }

  let interestScore = 0.6;
  if (request.interests.length) {
    const matched = request.interests.filter((i) => dest.interests.includes(i));
    interestScore = matched.length / request.interests.length;
    if (matched.length) reasons.push(`Great for ${matched.join(", ")}`);
  }

  let budgetScore = 0.7;
  if (request.budget) {
    budgetScore = dest.cost <= request.budget ? 1 : dest.cost - request.budget === 1 ? 0.4 : 0.1;
    if (dest.cost > request.budget) concerns.push("Usually pricier on the ground than your budget");
  }

  let seasonScore = 1;
  if (dest.stormMonths?.includes(month)) {
    seasonScore -= 0.35;
    concerns.push("Hurricane season — weather disruptions are more likely");
  } else if (dest.wetMonths?.includes(month)) {
    seasonScore -= 0.2;
    concerns.push("Rainy season");
  }

  const score = climateScore * 0.35 + interestScore * 0.35 + budgetScore * 0.15 + seasonScore * 0.15;
  return { score, reasons, concerns, climateMatch };
}

// ——— Discovery

export interface DiscoveryResult {
  destination: Destination;
  best: DateOption;
  alternatives: DateOption[];
  fit: Fit;
  score: number;
  why: string[];
}

export interface DiscoveryOutput {
  results: DiscoveryResult[];
  filtered: { destination: Destination; reason: string }[];
}

const FEASIBILITY_WEIGHT = { cautious: 0.65, balanced: 0.5, adventurous: 0.35 } as const;

export function discover(airline: AirlineAdapter, request: TripRequest, party: Party, destinations = DESTINATIONS, history?: FlightHistory): DiscoveryOutput {
  const engine = new ItineraryEngine(airline, history);
  const results: DiscoveryResult[] = [];
  const filtered: DiscoveryOutput["filtered"] = [];
  const { dates } = candidateDates(request);

  for (const destination of destinations) {
    const primary = destination.airports[0]!;
    if (request.origins.includes(primary)) {
      filtered.push({ destination, reason: "This is your home airport" });
      continue;
    }
    const domestic = isDomestic(primary);
    if (request.scope === "domestic" && !domestic) {
      filtered.push({ destination, reason: "International" });
      continue;
    }
    if (request.scope === "international" && domestic) {
      filtered.push({ destination, reason: "Domestic" });
      continue;
    }
    if (!destinationAirports(destination, request).some((a) => airline.network.serves(a))) {
      filtered.push({ destination, reason: `Not in the ${airline.name} reference network` });
      continue;
    }
    if (!dates.length) {
      filtered.push({ destination, reason: "No departure dates fit your window and deadline" });
      continue;
    }

    const comparison = compareDates({ airline, engine, request, party, destination, maxDates: 7 });
    const best = comparison.options[0];
    if (!best) {
      filtered.push({
        destination,
        reason: request.complexity === "nonstop" ? "No nonstop service in your window" : "No service in your window (likely seasonal)",
      });
      continue;
    }

    const fit = preferenceFit(destination, request, monthOf(best.date));
    if (!fit.climateMatch) {
      filtered.push({ destination, reason: "Climate doesn't match in your window" });
      continue;
    }
    const w = FEASIBILITY_WEIGHT[request.risk];
    const score = best.rank * w + fit.score * (1 - w);
    const why = [...fit.reasons.slice(0, 2)];
    const helps = best.assessment.factors.filter((f) => f.impact === "helps").sort((a, b) => b.weight * b.score - a.weight * a.score);
    if (helps[0]) why.push(helps[0].detail);
    results.push({ destination, best, alternatives: comparison.options.slice(1, 3), fit, score, why });
  }

  results.sort((a, b) => b.score - a.score);
  return { results, filtered };
}

/** Default flexible search: departures in the next two to five weeks. */
export function defaultRequest(today: ISODate, origin = "DFW"): TripRequest {
  return {
    origins: [origin],
    useAlternateOrigins: false,
    windowStart: addDays(today, 7),
    windowEnd: addDays(today, 35),
    nights: 4,
    homeBy: undefined,
    travelers: 2,
    scope: "any",
    climates: [],
    interests: [],
    budget: undefined,
    complexity: "one-stop",
    allowAlternateDestinations: true,
    risk: "balanced",
  };
}

export function windowLength(r: TripRequest) {
  return diffDays(r.windowStart, r.windowEnd) + 1;
}
