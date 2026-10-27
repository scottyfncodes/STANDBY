import type { Destination } from "@/lib/data/destinations";
import type { ISODate } from "@/lib/domain/types";
import { addDays, diffDays, monthOf, weekday } from "./time";

export type DemandLevel = "lighter" | "typical" | "elevated" | "peak";

/**
 * - `calendar`: computed from the calendar (federal holidays) — reliable dates,
 *   but the demand effect is a general pattern.
 * - `approximate`: windows that vary by year or district (school breaks, events).
 * - `general`: broad industry patterns (day of week), low confidence on any one route.
 */
export type SignalBasis = "calendar" | "approximate" | "general";

export interface DemandSignal {
  text: string;
  weight: number;
  basis: SignalBasis;
}

export interface DemandAssessment {
  date: ISODate;
  level: DemandLevel;
  pressure: number;
  signals: DemandSignal[];
}

function nthWeekday(year: number, month: number, dow: number, n: number): ISODate {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const offset = (dow - weekday(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

function lastWeekday(year: number, month: number, dow: number): ISODate {
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const last = addDays(nextMonth, -1);
  return addDays(last, -((weekday(last) - dow + 7) % 7));
}

/** Western Easter (Anonymous Gregorian algorithm). */
export function easter(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface Window {
  start: ISODate;
  end: ISODate;
  text: string;
  weight: number;
  basis: SignalBasis;
}

const yearCache = new Map<number, Window[]>();

/** US travel-demand windows for a calendar year. */
export function usDemandWindows(year: number): Window[] {
  const cached = yearCache.get(year);
  if (cached) return cached;
  const ymd = (m: number, d: number) => `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  const memorial = lastWeekday(year, 5, 1);
  const labor = nthWeekday(year, 9, 1, 1);
  const longWeekend = (mon: ISODate, name: string, weight: number): Window => ({
    start: addDays(mon, -3),
    end: addDays(mon, 1),
    text: `${name} weekend`,
    weight,
    basis: "calendar",
  });
  const windows: Window[] = [
    { start: addDays(thanksgiving, -2), end: addDays(thanksgiving, 4), text: "Thanksgiving travel period", weight: 2.5, basis: "calendar" },
    { start: ymd(12, 18), end: ymd(12, 31), text: "Christmas & New Year travel period", weight: 2.5, basis: "calendar" },
    { start: ymd(1, 1), end: ymd(1, 4), text: "New Year return rush", weight: 2, basis: "calendar" },
    { start: ymd(7, 1), end: ymd(7, 7), text: "Independence Day travel", weight: 2, basis: "calendar" },
    longWeekend(memorial, "Memorial Day", 2),
    longWeekend(labor, "Labor Day", 2),
    longWeekend(nthWeekday(year, 1, 1, 3), "MLK Day", 1),
    longWeekend(nthWeekday(year, 2, 1, 3), "Presidents' Day", 1.2),
    longWeekend(nthWeekday(year, 10, 1, 2), "Columbus / Indigenous Peoples' Day", 0.6),
    { start: ymd(3, 7), end: ymd(4, 12), text: "Spring break season (varies by school district)", weight: 1, basis: "approximate" },
    { start: ymd(6, 7), end: ymd(8, 16), text: "Summer school vacation", weight: 1, basis: "approximate" },
  ];
  yearCache.set(year, windows);
  return windows;
}

function eventWindows(dest: Destination, year: number): Window[] {
  const out: Window[] = [];
  for (const e of dest.events ?? []) {
    if (e.computed === "mardi-gras") {
      const fatTuesday = addDays(easter(year), -47);
      out.push({ start: addDays(fatTuesday, -11), end: addDays(fatTuesday, 1), text: `${e.name} — ${e.note}`, weight: 2, basis: "calendar" });
    } else if (e.start && e.end) {
      const start = `${year}-${e.start}`;
      // Windows that wrap the year end (e.g. 12-15 → 04-15).
      const end = e.end < e.start ? `${year + 1}-${e.end}` : `${year}-${e.end}`;
      const prevStart = `${year - 1}-${e.start}`;
      out.push({ start, end, text: `${e.name} — ${e.note}`, weight: 1.5, basis: "approximate" });
      if (e.end < e.start) out.push({ start: prevStart, end: `${year}-${e.end}`, text: `${e.name} — ${e.note}`, weight: 1.5, basis: "approximate" });
    }
  }
  return out;
}

const DOW_SIGNALS: Record<number, DemandSignal | undefined> = {
  5: { text: "Fridays are commonly busy leisure travel days", weight: 0.4, basis: "general" },
  0: { text: "Sundays are commonly busy return days", weight: 0.4, basis: "general" },
  2: { text: "Tuesdays are often lighter (general pattern — not route-specific)", weight: -0.3, basis: "general" },
  3: { text: "Wednesdays are often lighter (general pattern — not route-specific)", weight: -0.3, basis: "general" },
  6: { text: "Saturdays are often lighter outside holiday periods (general pattern)", weight: -0.25, basis: "general" },
};

export function levelFor(pressure: number): DemandLevel {
  if (pressure <= -0.2) return "lighter";
  if (pressure < 1) return "typical";
  if (pressure < 2) return "elevated";
  return "peak";
}

/** Demand pressure for one travel date toward/from a destination. */
export function assessDemand(date: ISODate, dest?: Destination): DemandAssessment {
  const year = Number(date.slice(0, 4));
  const signals: DemandSignal[] = [];
  const windows = [...usDemandWindows(year), ...(dest ? eventWindows(dest, year) : [])];
  let holiday = false;
  for (const w of windows) {
    if (date >= w.start && date <= w.end) {
      signals.push({ text: w.text, weight: w.weight, basis: w.basis });
      if (w.basis === "calendar" && w.weight >= 2) holiday = true;
    }
  }
  if (dest?.peakMonths.includes(monthOf(date))) {
    signals.push({ text: `Peak season for ${dest.name}`, weight: 0.8, basis: "approximate" });
  }
  const dow = DOW_SIGNALS[weekday(date)];
  // Day-of-week effects are swamped by holidays; don't claim a "light Tuesday" at Christmas.
  if (dow && !(holiday && dow.weight < 0)) signals.push(dow);

  const pressure = signals.reduce((s, x) => s + x.weight, 0);
  return { date, level: levelFor(pressure), pressure, signals };
}

export const DEMAND_LABEL: Record<DemandLevel, string> = {
  lighter: "Often lighter",
  typical: "Typical demand",
  elevated: "Elevated demand",
  peak: "Peak demand",
};

export function daysBetweenInclusive(a: ISODate, b: ISODate) {
  return diffDays(a, b) + 1;
}
