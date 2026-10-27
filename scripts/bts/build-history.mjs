#!/usr/bin/env node
/**
 * Build STANDBY's historical American Airlines schedule & reliability dataset from
 * the US DOT Bureau of Transportation Statistics (BTS) on-time performance files.
 *
 * BTS data is public domain. It covers US domestic flights (incl. Puerto Rico and
 * the US Virgin Islands) operated or marketed by reporting carriers — not
 * international routes, and not standby loads.
 *
 * Usage: node scripts/bts/build-history.mjs 2025-06 2026-05 [out.json]
 * Requires: curl, unzip. Runs in CI (GitHub Actions); not at app runtime.
 */
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const [from = "2025-06", to = "2026-05", out = "public/data/aa-history.json"] = positional;
/** Fail instead of publishing a dataset with missing months. */
const STRICT = flags.has("--strict");
/** Minimum routes for a plausible AA dataset (the full network yields ~800). */
const MIN_ROUTES = flags.has("--no-validate") ? 0 : 400;
const TMP = process.env.RUNNER_TEMP ?? "/tmp";

// Only keep routes between airports STANDBY knows about.
const airportsSrc = readFileSync(path.join("src/lib/data/airports.ts"), "utf8");
const AIRPORTS = new Set([...airportsSrc.matchAll(/code: "([A-Z]{3})"/g)].map((m) => m[1]));

// American plus its wholly owned regionals (used only with the reporting-carrier file).
const AA_FAMILY = new Set(["AA", "MQ", "OH", "PT"]);

function months(a, b) {
  const out = [];
  let [y, m] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  while (y < by || (y === by && m <= bm)) {
    out.push([y, m]);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function sources(y, m) {
  return [
    { kind: "marketing", url: `https://transtats.bts.gov/PREZIP/On_Time_Marketing_Carrier_On_Time_Performance_Beginning_January_2018_${y}_${m}.zip` },
    { kind: "reporting", url: `https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_${y}_${m}.zip` },
  ];
}

function download(url, file) {
  try {
    execFileSync("curl", ["-fsSL", "--retry", "3", "--retry-delay", "5", "--max-time", "600", "-o", file, url], { stdio: ["ignore", "inherit", "inherit"] });
    return true;
  } catch {
    return false;
  }
}

/** Minimal CSV split that handles quoted fields (BTS quotes text fields). */
function splitCsv(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const routes = new Map(); // key -> { monthly: Map<"y-m", MonthAgg>, rel: {...}, blockSum, blockN }

function route(key) {
  let r = routes.get(key);
  if (!r) {
    r = { monthly: new Map(), rel: { n: 0, cancelled: 0, diverted: 0, completed: 0, late15: 0, late30: 0, late60: 0 }, blockSum: 0, blockN: 0 };
    routes.set(key, r);
  }
  return r;
}

async function processFile(zip, kind, y, m) {
  const child = spawn("unzip", ["-p", zip], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let idx;
  let kept = 0;
  let seen = 0;
  for await (const line of rl) {
    if (!line) continue;
    if (!idx) {
      const header = splitCsv(line).map((h) => h.trim().replace(/"/g, ""));
      const find = (...names) => {
        for (const n of names) {
          const i = header.indexOf(n);
          if (i >= 0) return i;
        }
        return -1;
      };
      idx = {
        carrier: kind === "marketing" ? find("Marketing_Airline_Network", "IATA_Code_Marketing_Airline") : find("Reporting_Airline", "IATA_CODE_Reporting_Airline"),
        origin: find("Origin"),
        dest: find("Dest"),
        date: find("FlightDate"),
        crsDep: find("CRSDepTime"),
        arrDelay: find("ArrDelay", "ArrDelayMinutes"),
        cancelled: find("Cancelled"),
        diverted: find("Diverted"),
        elapsed: find("CRSElapsedTime"),
      };
      const missing = Object.entries(idx).filter(([, v]) => v < 0).map(([k]) => k);
      console.log(`  ${kind} ${y}-${m}: ${header.length} columns${missing.length ? `, MISSING ${missing.join(",")}` : ""}`);
      if (missing.length) {
        child.kill();
        return false;
      }
      continue;
    }
    seen++;
    const f = splitCsv(line);
    const carrier = f[idx.carrier];
    if (kind === "marketing" ? carrier !== "AA" : !AA_FAMILY.has(carrier)) continue;
    const o = f[idx.origin];
    const d = f[idx.dest];
    if (!AIRPORTS.has(o) || !AIRPORTS.has(d)) continue;
    kept++;
    const r = route(`${o}-${d}`);
    const ym = `${y}-${m}`;
    let mo = r.monthly.get(ym);
    if (!mo) r.monthly.set(ym, (mo = { y, m, times: new Map() }));
    const date = f[idx.date];
    const crs = f[idx.crsDep].padStart(4, "0");
    // BTS writes midnight at the end of the flight date as 2400; keep it on that date.
    const t = crs === "2400" ? "23:59" : `${crs.slice(0, 2)}:${crs.slice(2, 4)}`;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) continue;
    if (!mo.times.has(t)) mo.times.set(t, new Set());
    mo.times.get(t).add(date);

    const elapsed = Number(f[idx.elapsed]);
    if (elapsed > 0) {
      r.blockSum += elapsed;
      r.blockN++;
    }
    const rel = r.rel;
    rel.n++;
    if (Number(f[idx.cancelled]) === 1) rel.cancelled++;
    else if (Number(f[idx.diverted]) === 1) rel.diverted++;
    else {
      rel.completed++;
      const raw = f[idx.arrDelay];
      if (raw === "" || raw === undefined) {
        rel.completed--; // no arrival delay reported; leave out of lateness shares
        continue;
      }
      const delay = Number(raw);
      if (delay >= 15) rel.late15++;
      if (delay >= 30) rel.late30++;
      if (delay >= 60) rel.late60++;
    }
  }
  console.log(`  rows ${seen}, kept ${kept}`);
  return seen > 0;
}

const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Schedules shift by a few minutes mid-month (e.g. 18:39 → 18:45). Merge nearby times
 * whose operating dates barely overlap into one flight, labeled with its most common time.
 */
export function mergeShiftedTimes(timeMap) {
  const entries = [...timeMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const clusters = [];
  for (const [t, dates] of entries) {
    const prev = clusters[clusters.length - 1];
    if (prev && toMin(t) - toMin(prev.last) <= 45) {
      let overlap = 0;
      for (const d of dates) if (prev.dates.has(d)) overlap++;
      if (overlap <= 0.2 * Math.min(dates.size, prev.dates.size)) {
        for (const d of dates) prev.dates.add(d);
        if (dates.size > prev.bestCount) {
          prev.best = t;
          prev.bestCount = dates.size;
        }
        prev.last = t;
        continue;
      }
    }
    clusters.push({ best: t, bestCount: dates.size, last: t, dates: new Set(dates) });
  }
  return clusters.map((c) => [c.best, c.dates]).sort(([a], [b]) => a.localeCompare(b));
}


const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();

async function main() {
const used = [];
const failed = [];
for (const [y, m] of months(from, to)) {
  console.log(`Month ${y}-${m}`);
  let ok = false;
  for (const s of sources(y, m)) {
    const zip = path.join(TMP, `bts_${s.kind}_${y}_${m}.zip`);
    if (!existsSync(zip) && !download(s.url, zip)) {
      console.log(`  ${s.kind}: download failed (${s.url})`);
      continue;
    }
    ok = await processFile(zip, s.kind, y, m);
    rmSync(zip, { force: true });
    if (ok) {
      used.push({ month: `${y}-${String(m).padStart(2, "0")}`, dataset: s.kind });
      break;
    }
  }
  if (!ok) failed.push(`${y}-${m}`);
}

if (STRICT && failed.length) {
  console.error(`Strict mode: ${failed.length} month(s) could not be processed (${failed.join(", ")}). Not publishing a partial dataset.`);
  process.exit(1);
}
if (!used.length) {
  console.error("No BTS months could be processed.");
  process.exit(1);
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const outRoutes = {};
for (const [key, r] of routes) {
  const monthsOut = {};
  // For each calendar month keep only the most recent year processed.
  const latest = new Map();
  for (const mo of r.monthly.values()) {
    const cur = latest.get(mo.m);
    if (!cur || mo.y > cur.y) latest.set(mo.m, mo);
  }
  for (const [mNum, mo] of latest) {
    const clusters = mergeShiftedTimes(mo.times);
    // Median flights per day for each weekday (dates with no flights count as zero).
    const perDate = new Map();
    for (const dates of mo.times.values()) for (const ds of dates) perDate.set(ds, (perDate.get(ds) ?? 0) + 1);
    const byDow = [[], [], [], [], [], [], []];
    const days = new Date(Date.UTC(mo.y, mo.m, 0)).getUTCDate();
    // Seasonal starts/ends: the operating span when the route didn't fly the whole month.
    let first = 99;
    let last = 0;
    for (const ds of perDate.keys()) {
      const dom = Number(ds.slice(8, 10));
      first = Math.min(first, dom);
      last = Math.max(last, dom);
    }
    const span = first > 3 || last < days - 2 ? [first, last] : undefined;
    // Typical flights per weekday, counted only on dates inside the operating span.
    for (let d = first; d <= last; d++) {
      const ds = `${mo.y}-${String(mo.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      byDow[new Date(`${ds}T00:00:00Z`).getUTCDay()].push(perDate.get(ds) ?? 0);
    }
    const median = (xs) => {
      const s = [...xs].sort((a, b) => a - b);
      return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
    };
    const n = byDow.map(median);
    const spanDow = byDow.map((xs) => xs.length);
    const times = [];
    for (const [t, dates] of clusters) {
      const perDow = [0, 0, 0, 0, 0, 0, 0];
      for (const ds of dates) perDow[new Date(`${ds}T00:00:00Z`).getUTCDay()]++;
      const shares = perDow.map((c, i) => (spanDow[i] ? c / spanDow[i] : 0));
      if (Math.max(...shares) < 0.25) continue; // one-off or irregular
      times.push([t, shares.map((s) => Math.min(9, Math.round(s * 9))).join("")]);
    }
    if (times.length) monthsOut[mNum] = span ? { y: mo.y, n, s: span, t: times } : { y: mo.y, n, t: times };
  }
  if (!Object.keys(monthsOut).length) continue;
  const rel = r.rel;
  outRoutes[key] = {
    b: r.blockN ? Math.round(r.blockSum / r.blockN) : null,
    m: monthsOut,
    r: { n: rel.n, cancel: pct(rel.cancelled, rel.n), divert: pct(rel.diverted, rel.n), late15: pct(rel.late15, rel.completed), late30: pct(rel.late30, rel.completed), late60: pct(rel.late60, rel.completed) },
  };
}

const result = {
  meta: {
    source: "US DOT Bureau of Transportation Statistics — Airline On-Time Performance (public domain)",
    carrier: "AA (marketed; or AA/MQ/OH/PT reported)",
    months: used,
    failedMonths: failed,
    generatedAt: new Date().toISOString(),
    note: "Historical scheduled departure times as flown, per calendar month and weekday share (digits 0–9 = share of that weekday's dates the time operated). Reliability covers all processed months.",
  },
  routes: outRoutes,
};
mkdirSync(path.dirname(out), { recursive: true });
const routeCount = Object.keys(outRoutes).length;
let previous;
try {
  previous = JSON.parse(readFileSync(out, "utf8"));
} catch {
  previous = undefined;
}
const prevCount = previous ? Object.keys(previous.routes ?? {}).length : 0;
if (routeCount < MIN_ROUTES || (MIN_ROUTES && prevCount && routeCount < prevCount * 0.8 && !flags.has("--allow-shrink"))) {
  console.error(`Validation failed: ${routeCount} routes (previous ${prevCount}, minimum ${MIN_ROUTES}). Not publishing.`);
  process.exit(1);
}
// Keep the previous timestamp when nothing but the timestamp would change, so reruns don't commit noise.
if (previous && JSON.stringify({ ...previous.meta, generatedAt: "" }) === JSON.stringify({ ...result.meta, generatedAt: "" }) && JSON.stringify(previous.routes) === JSON.stringify(result.routes)) {
  result.meta.generatedAt = previous.meta.generatedAt;
}
writeFileSync(out, JSON.stringify(result));
console.log(`Wrote ${out}: ${routeCount} routes (previous ${prevCount}) from ${used.length} months (${failed.length} failed).`);
}
