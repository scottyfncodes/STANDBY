import { isISODate } from "@/lib/engine/time";
import type { Budget, Climate, Complexity, Interest, RiskTolerance, Scope, TripRequest } from "./types";

/*
 * TripRequest <-> URL search params. Keeps searches shareable and lets the trip
 * page re-derive its plan without a server round-trip. Invalid values fall back
 * to the provided defaults rather than throwing.
 */

const CLIMATES: Climate[] = ["hot", "warm", "mild", "cool", "snow"];
const INTERESTS: Interest[] = ["beach", "city", "outdoors", "culture", "food", "events", "relaxation"];
const SCOPES: Scope[] = ["any", "domestic", "international"];
const RISKS: RiskTolerance[] = ["cautious", "balanced", "adventurous"];
const COMPLEXITY: Complexity[] = ["nonstop", "one-stop"];

export function encodeRequest(r: TripRequest): URLSearchParams {
  const p = new URLSearchParams();
  p.set("o", r.origins.join(","));
  if (r.useAlternateOrigins) p.set("alt", "1");
  p.set("s", r.windowStart);
  p.set("e", r.windowEnd);
  p.set("n", String(r.nights));
  if (r.homeBy) p.set("h", r.homeBy);
  p.set("t", String(r.travelers));
  if (r.scope !== "any") p.set("sc", r.scope);
  if (r.climates.length) p.set("cl", r.climates.join(","));
  if (r.interests.length) p.set("in", r.interests.join(","));
  if (r.budget) p.set("b", String(r.budget));
  if (r.complexity !== "one-stop") p.set("cx", r.complexity);
  if (!r.allowAlternateDestinations) p.set("ad", "0");
  if (r.risk !== "balanced") p.set("r", r.risk);
  return p;
}

const list = <T extends string>(v: string | null, allowed: readonly T[]): T[] =>
  (v ?? "").split(",").filter((x): x is T => (allowed as readonly string[]).includes(x));

const int = (v: string | null, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export function decodeRequest(p: URLSearchParams, defaults: TripRequest): TripRequest {
  const origins = (p.get("o") ?? "")
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter((x) => /^[A-Z]{3}$/.test(x))
    .slice(0, 4);
  const s = p.get("s");
  const e = p.get("e");
  const h = p.get("h");
  const windowStart = isISODate(s) ? s : defaults.windowStart;
  let windowEnd = isISODate(e) ? e : defaults.windowEnd;
  if (windowEnd < windowStart) windowEnd = windowStart;
  const b = int(p.get("b"), 1, 3, 0);
  const scope = p.get("sc");
  const risk = p.get("r");
  const cx = p.get("cx");
  return {
    origins: origins.length ? origins : defaults.origins,
    useAlternateOrigins: p.get("alt") === "1",
    windowStart,
    windowEnd,
    nights: int(p.get("n"), 1, 30, defaults.nights),
    homeBy: isISODate(h) ? h : undefined,
    travelers: int(p.get("t"), 1, 9, defaults.travelers),
    scope: SCOPES.includes(scope as Scope) ? (scope as Scope) : "any",
    climates: list(p.get("cl"), CLIMATES),
    interests: list(p.get("in"), INTERESTS),
    budget: b ? (b as Budget) : undefined,
    complexity: COMPLEXITY.includes(cx as Complexity) ? (cx as Complexity) : "one-stop",
    allowAlternateDestinations: p.get("ad") !== "0",
    risk: RISKS.includes(risk as RiskTolerance) ? (risk as RiskTolerance) : "balanced",
  };
}
