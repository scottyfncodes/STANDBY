import type { ISODate, LocalTime } from "@/lib/domain/types";

/*
 * Date-only values (`YYYY-MM-DD`) are handled as UTC midnights so that weekday and
 * day arithmetic never shifts with the device's time zone. Wall-clock flight times
 * are converted to real instants with the airport's IANA zone.
 */

const DAY_MS = 86_400_000;

const parsed = new Map<string, number>();
function parseDate(d: ISODate): number {
  const hit = parsed.get(d);
  if (hit !== undefined) return hit;
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) throw new Error(`Invalid date: ${d}`);
  const ms = Date.UTC(y, m - 1, day);
  if (parsed.size > 10_000) parsed.clear();
  parsed.set(d, ms);
  return ms;
}

function fmtDate(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fmtDate(parseDate(s)) === s;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fmtDate(parseDate(d) + n * DAY_MS);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(d: ISODate): number {
  return new Date(parseDate(d)).getUTCDay();
}

export function monthOf(d: ISODate): number {
  return Number(d.slice(5, 7));
}

export function eachDate(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Today's calendar date in a given zone (defaults to the runtime's zone). */
export function todayIn(tz?: string, now: Date = new Date()): ISODate {
  return zonedParts(now.getTime(), tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone).date;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(tz, f);
  }
  return f;
}

/** Exact (uncached) local parts via Intl. */
function intlParts(instantMs: number, tz: string): { date: ISODate; time: LocalTime } {
  const parts = Object.fromEntries(formatter(tz).formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]));
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
}

const BUCKET_MS = 15 * 60_000;
const offsetCache = new Map<string, Map<number, number>>();

/**
 * Offset (ms) of `tz` from UTC at a given instant. Cached per 15-minute bucket:
 * real-world zone transitions happen on quarter-hour UTC boundaries, so the
 * offset is constant within a bucket.
 */
function offsetMs(instantMs: number, tz: string): number {
  let zone = offsetCache.get(tz);
  if (!zone) offsetCache.set(tz, (zone = new Map()));
  const bucket = Math.floor(instantMs / BUCKET_MS);
  const cached = zone.get(bucket);
  if (cached !== undefined) return cached;
  const probe = bucket * BUCKET_MS;
  const { date, time } = intlParts(probe, tz);
  const offset = parseDate(date) + timeToMinutes(time) * 60_000 - probe;
  if (zone.size > 20_000) zone.clear();
  zone.set(bucket, offset);
  return offset;
}

/** Local calendar date and wall time for an instant in a zone. */
export function zonedParts(instantMs: number, tz: string): { date: ISODate; time: LocalTime } {
  const iso = new Date(instantMs + offsetMs(instantMs, tz)).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * Convert a local wall-clock time at an airport to a UTC instant (ms).
 * Times that fall into a DST "spring forward" gap resolve to the later offset;
 * ambiguous "fall back" times resolve to the first occurrence.
 */
export function zonedToUtc(date: ISODate, time: LocalTime, tz: string): number {
  const naive = parseDate(date) + timeToMinutes(time) * 60_000;
  // Candidate offsets on either side of any transition near this wall time.
  const o1 = offsetMs(naive - 12 * 3_600_000, tz);
  const o2 = offsetMs(naive + 12 * 3_600_000, tz);
  if (o1 === o2) return naive - o1;
  const candidates = [naive - o1, naive - o2].sort((a, b) => a - b);
  for (const c of candidates) {
    const p = zonedParts(c, tz);
    if (p.date === date && p.time === time) return c;
  }
  // In a spring-forward gap: no valid wall time exists; use the later offset.
  return naive - Math.min(o1, o2);
}

export function minutesToTime(min: number): LocalTime {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function timeToMinutes(t: LocalTime): number {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const weekdayName = (d: ISODate, long = false) => (long ? WEEKDAYS_LONG : WEEKDAYS)[weekday(d)]!;
export const monthName = (m: number, long = false) => (long ? MONTHS_LONG : MONTHS)[m - 1]!;

/** "Tue, Nov 4" */
export function formatDate(d: ISODate): string {
  return `${weekdayName(d)}, ${monthName(monthOf(d))} ${Number(d.slice(8, 10))}`;
}

/** "Nov 4" */
export function formatShortDate(d: ISODate): string {
  return `${monthName(monthOf(d))} ${Number(d.slice(8, 10))}`;
}

/** "7:05a" style compact 12h time. */
export function formatTime(t: LocalTime): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h! < 12 ? "a" : "p";
  const h12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
