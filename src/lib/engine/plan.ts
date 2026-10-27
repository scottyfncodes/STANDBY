import { getAirport } from "@/lib/data/airports";
import type { Destination } from "@/lib/data/destinations";
import type { AirportCode, ISODate, TripRequest } from "@/lib/domain/types";
import { RESERVE_ATTEMPTS, type TripAssessment } from "./assess";
import { arrivingBy, dayOptions, summarizePaths, type DayOptions, type Itinerary, type ItineraryEngine, type PathSummary } from "./itinerary";
import { addDays, formatDate, formatTime } from "./time";

export type FallbackKind =
  | "later-same-route"
  | "other-hub"
  | "nonstop"
  | "alt-origin"
  | "alt-destination"
  | "next-day"
  | "hub-overnight";

export interface FallbackOption {
  kind: FallbackKind;
  title: string;
  detail: string;
  /** Practical usefulness, higher first. */
  score: number;
  tone: "good" | "ok" | "caution";
  /** Option requires a setting the traveler hasn't enabled. */
  needsSetting?: string;
}

export interface ReturnDay {
  date: ISODate;
  attempts: number;
  first?: Itinerary;
  last?: Itinerary;
}

export interface ReturnPlan {
  days: ReturnDay[];
  totalAttempts: number;
  reserve: number;
  /** Latest first attempt that still leaves `reserve` backups before the deadline. */
  latestSensible?: Itinerary;
  deadlineRisk: "low" | "moderate" | "high" | "no-deadline";
  advice: string;
}

export interface TripPlan {
  outboundPaths: PathSummary[];
  returnPaths: PathSummary[];
  primaryOut?: PathSummary;
  primaryBack?: PathSummary;
  firstAttempt?: Itinerary;
  outboundFallbacks: FallbackOption[];
  returnFallbacks: FallbackOption[];
  returnPlan: ReturnPlan;
  sequence: string[];
}

const byDeadline = (d: DayOptions, deadline?: ISODate) => (deadline ? arrivingBy(d, deadline) : d);
const city = (code: AirportCode) => getAirport(code)?.city ?? code;
const sameDay = (p: PathSummary) => p.options.filter((o) => !o.overnightConnection);
const pathLabel = (p: PathSummary) => (p.via ? `${p.origin} → ${p.via} → ${p.destination}` : `${p.origin} → ${p.destination} nonstop`);
const at = (i: Itinerary) => `${formatTime(i.legs[0]!.depLocal.time)}`;

/**
 * Build fallbacks for one direction of travel.
 * `primaryOrigins` are the airports the traveler prefers to start from; anything else
 * found in `day` is treated as an alternate departure airport.
 */
export function buildFallbacks(args: {
  engine: ItineraryEngine;
  day: DayOptions;
  paths: PathSummary[];
  primary: PathSummary | undefined;
  primaryOrigins: AirportCode[];
  destAirports: AirportCode[];
  extraDestAirports: AirportCode[];
  allowConnections: boolean;
  nextDayAllowed: boolean;
  /** For the trip home: only count attempts that land by the end of this date. */
  arriveBy?: ISODate;
  nextDayNote: string;
  originsForAlternates: AirportCode[];
}): FallbackOption[] {
  const { engine, day, paths, primary, primaryOrigins } = args;
  const out: FallbackOption[] = [];
  if (!primary) return out;
  const primarySame = sameDay(primary);

  // 1. Later flight, same route.
  if (primarySame.length > 1) {
    const last = primarySame[primarySame.length - 1]!;
    out.push({
      kind: "later-same-route",
      title: `${primarySame.length - 1} later ${primary.via ? "departure" : "nonstop"}${primarySame.length - 1 === 1 ? "" : "s"} on the same route`,
      detail: `Stay listed and roll to the next ${pathLabel(primary)} flight. Last same-day attempt around ${at(last)}.`,
      score: 10 + primarySame.length,
      tone: primarySame.length >= 3 ? "good" : "ok",
    });
  }

  // 2. Same origin, different routing (other hub or a nonstop).
  const sameOriginAlts = paths.filter((p) => p !== primary && primaryOrigins.includes(p.origin) && args.destAirports.includes(p.destination) && sameDay(p).length);
  for (const p of sameOriginAlts.slice(0, 3)) {
    const n = sameDay(p).length;
    out.push({
      kind: p.via ? "other-hub" : "nonstop",
      title: p.via ? `Connect through ${city(p.via)} instead` : `Take the ${p.origin}–${p.destination} nonstop`,
      detail: `${pathLabel(p)} · about ${n} option${n === 1 ? "" : "s"} that day${p.weakestDaily <= 1 ? " · thin, once-daily leg" : ""}.`,
      score: 8 + Math.min(n, 6) * 0.5 - (p.weakestDaily <= 1 ? 2 : 0),
      tone: n >= 3 && p.weakestDaily > 1 ? "good" : "ok",
    });
  }

  // 3. Different departure airport.
  const altOriginPaths = paths.filter((p) => !primaryOrigins.includes(p.origin) && args.destAirports.includes(p.destination) && sameDay(p).length);
  const byOrigin = new Map<AirportCode, PathSummary>();
  for (const p of altOriginPaths) if (!byOrigin.has(p.origin)) byOrigin.set(p.origin, p);
  for (const p of [...byOrigin.values()].slice(0, 2)) {
    const n = sameDay(p).length;
    out.push({
      kind: "alt-origin",
      title: `Start from ${p.origin} (${city(p.origin)})`,
      detail: `${pathLabel(p)} · about ${n} option${n === 1 ? "" : "s"} that day. Worth it if the drive is easy.`,
      score: 6 + Math.min(n, 6) * 0.4,
      tone: n >= 3 ? "ok" : "caution",
    });
  }
  if (!byOrigin.size && args.originsForAlternates.length) {
    const alts = args.originsForAlternates.filter((o) => !primaryOrigins.includes(o));
    const d = byDeadline(dayOptions(engine, alts, args.destAirports, day.date, args.allowConnections), args.arriveBy);
    if (d.depth) {
      out.push({
        kind: "alt-origin",
        title: `Nearby airports add ${d.depth} more option${d.depth === 1 ? "" : "s"}`,
        detail: `Departing from ${alts.join(" or ")} opens additional flights that day.`,
        score: 5,
        tone: "ok",
        needsSetting: "Turn on nearby departure airports",
      });
    }
  }

  // 4. Alternate destination airport.
  for (const alt of args.extraDestAirports) {
    const d = byDeadline(dayOptions(engine, primaryOrigins, [alt], day.date, args.allowConnections), args.arriveBy);
    if (!d.depth) continue;
    const enabled = args.destAirports.includes(alt);
    out.push({
      kind: "alt-destination",
      title: `Fly into ${alt} (${city(alt)})`,
      detail: `About ${d.depth} flight${d.depth === 1 ? "" : "s"} you could try for, then ground transport. Plan the transfer before you go.`,
      score: 5 + Math.min(d.depth, 6) * 0.3,
      tone: "ok",
      needsSetting: enabled ? undefined : "Allow alternate arrival airports",
    });
  }

  // 5. Stranding at the hub.
  if (primary.via) {
    const hub = primary.via;
    const onwardDaily = primary.legDaily[1] ?? 0;
    const firstOnward = primarySame[0]?.legs[1];
    out.push({
      kind: "hub-overnight",
      title: onwardDaily <= 2 ? `Stranding risk in ${city(hub)}` : `If you clear to ${hub} but not onward`,
      detail:
        onwardDaily <= 2
          ? `Only about ${onwardDaily} onward flight${onwardDaily === 1 ? "" : "s"} a day from ${hub}. Missing ${onwardDaily === 1 ? "it" : "them"} likely means a night in ${city(hub)} — budget for a hotel.`
          : `About ${onwardDaily} onward flights a day from ${hub}${firstOnward ? ` starting around ${formatTime(firstOnward.depLocal.time)}` : ""}; an overnight is unlikely but possible late in the day.`,
      score: onwardDaily <= 2 ? 3 : 2,
      tone: onwardDaily <= 2 ? "caution" : "ok",
    });
  }

  // 6. Next day.
  const nextRaw = dayOptions(engine, args.originsForAlternates.length ? args.originsForAlternates : primaryOrigins, args.destAirports, addDays(day.date, 1), args.allowConnections);
  // When the next day is still allowed, only count flights that land in time; otherwise keep the
  // raw count so the option can explain that it would miss the deadline.
  const next = args.nextDayAllowed ? byDeadline(nextRaw, args.arriveBy) : nextRaw;
  if (next.depth) {
    out.push({
      kind: "next-day",
      title: `Try again ${formatDate(next.date)}`,
      detail: `About ${next.depth} attempts the following day. ${args.nextDayNote}`,
      score: args.nextDayAllowed ? 4 : 1,
      tone: args.nextDayAllowed ? "ok" : "caution",
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

export function buildReturnPlan(assessment: TripAssessment, request: TripRequest): ReturnPlan {
  const reserve = RESERVE_ATTEMPTS[request.risk];
  const days: ReturnDay[] = assessment.recovery.map((d) => {
    const same = d.itineraries.filter((i) => !i.overnightConnection);
    return { date: d.date, attempts: d.depth, first: same[0], last: same[same.length - 1] };
  });
  // One attempt per distinct departure time (two routings leaving together are one attempt).
  const seen = new Set<number>();
  const all = assessment.recovery
    .flatMap((d) => d.itineraries.filter((i) => !i.overnightConnection))
    .sort((a, b) => a.depUtc - b.depUtc)
    .filter((i) => (seen.has(i.depUtc) ? false : (seen.add(i.depUtc), true)));
  const totalAttempts = days.reduce((s, d) => s + d.attempts, 0);

  if (assessment.slackDays === null) {
    return {
      days,
      totalAttempts,
      reserve,
      deadlineRisk: "no-deadline",
      advice: "No hard deadline set. Start with the first flight home on your return day so later flights remain as backups.",
    };
  }

  // Latest first attempt that still leaves `reserve` more attempts before the deadline.
  const latestSensible = all.length > reserve ? all[all.length - 1 - reserve] : undefined;
  const deadlineRisk: ReturnPlan["deadlineRisk"] = totalAttempts <= reserve ? "high" : totalAttempts <= reserve * 3 ? "moderate" : "low";
  const advice = latestSensible
    ? `Make your first attempt home no later than ${formatDate(latestSensible.legs[0]!.depLocal.date)} around ${at(latestSensible)} so ${reserve} backup${reserve === 1 ? "" : "s"} remain before your deadline.`
    : `There are only ${totalAttempts} attempt${totalAttempts === 1 ? "" : "s"} home before your deadline. Consider an earlier return, a different destination, or a confirmed ticket as backup.`;
  return { days, totalAttempts, reserve, latestSensible, deadlineRisk, advice };
}

export function buildPlan(args: {
  engine: ItineraryEngine;
  assessment: TripAssessment;
  destination: Destination;
  request: TripRequest;
  allOrigins: AirportCode[];
}): TripPlan {
  const { engine, assessment: a, destination, request } = args;
  const allowConn = request.complexity !== "nonstop";
  // Routings to/from the primary destination airport come first; alternates are backups.
  const primaryDest = a.destAirports[0];
  const primaryFirst = (paths: PathSummary[], end: "origin" | "destination") => [
    ...paths.filter((p) => p[end] === primaryDest && sameDay(p).length),
    ...paths.filter((p) => !(p[end] === primaryDest && sameDay(p).length)),
  ];
  const outboundPaths = primaryFirst(summarizePaths(a.outbound), "destination");
  const returnPaths = primaryFirst(summarizePaths(a.inbound), "origin");
  const primaryOrigin = request.origins[0];
  const primaryOut = outboundPaths.find((p) => p.origin === primaryOrigin && sameDay(p).length) ?? outboundPaths.find((p) => sameDay(p).length);
  const primaryBack = returnPaths.find((p) => p.destination === primaryOut?.origin && sameDay(p).length) ?? returnPaths.find((p) => sameDay(p).length);
  const firstAttempt = primaryOut ? sameDay(primaryOut)[0] : undefined;
  const extraDest = destination.airports.slice(1);

  const slack = a.slackDays;
  const outboundFallbacks = buildFallbacks({
    engine,
    day: a.outbound,
    paths: outboundPaths,
    primary: primaryOut,
    primaryOrigins: request.origins,
    destAirports: a.destAirports,
    extraDestAirports: extraDest,
    allowConnections: allowConn,
    nextDayAllowed: true,
    nextDayNote: slack !== null && slack <= 0 ? "Leaving a day late shortens the trip by a night." : "You can keep the return date and take one fewer night, or shift both.",
    originsForAlternates: args.allOrigins,
  });

  const returnFallbacks = buildFallbacks({
    engine,
    day: a.inbound,
    paths: returnPaths,
    primary: primaryBack,
    primaryOrigins: a.destAirports,
    destAirports: a.homeAirports,
    extraDestAirports: [],
    allowConnections: allowConn,
    nextDayAllowed: slack === null || slack >= 1,
    arriveBy: request.homeBy,
    nextDayNote: slack === null ? "No deadline set." : slack >= 1 ? `Still within your deadline (${slack} spare day${slack === 1 ? "" : "s"}).` : "This would miss your return deadline.",
    originsForAlternates: destination.airports,
  });

  const returnPlan = buildReturnPlan(a, request);
  const sequence: string[] = [];
  if (firstAttempt && primaryOut) {
    sequence.push(`List for the first ${pathLabel(primaryOut)} departure (around ${at(firstAttempt)}) — early flights leave the most room to retry.`);
    const best = outboundFallbacks[0];
    if (best) sequence.push(`If it doesn't clear: ${best.title.charAt(0).toLowerCase()}${best.title.slice(1)}.`);
    if (primaryOut.via) sequence.push(`At ${primaryOut.via}, check the onward list immediately; know the last flight out before you land.`);
  }
  if (primaryBack) sequence.push(`Coming home, start with the first ${pathLabel(primaryBack)} flight on ${formatDate(a.returnDate)}.`);
  if (returnPlan.latestSensible) sequence.push(`Don't start later than ${formatDate(returnPlan.latestSensible.legs[0]!.depLocal.date)} ~${at(returnPlan.latestSensible)} if you must be home by your deadline.`);

  return { outboundPaths, returnPaths, primaryOut, primaryBack, firstAttempt, outboundFallbacks, returnFallbacks, returnPlan, sequence };
}
