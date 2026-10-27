#!/usr/bin/env node
/**
 * Build STANDBY's historical load-factor dataset from BTS T-100 Segment data
 * (table "T-100 Segment (All Carriers)", domestic + international, public domain).
 *
 * Load factor = passengers / seats on a nonstop segment for a calendar month. It is a
 * monthly average across all of a route's flights — historical context about how full
 * flights tended to be, NOT current seat availability and NOT a standby clearance signal.
 *
 * TranStats has no static file for T-100, so this script drives its public download form:
 * GET the form (ASP.NET view state), then POST the selected fields for one month. The
 * response is a zip containing a CSV.
 *
 * Usage: node scripts/bts/build-loads.mjs [--to YYYY-MM] [--out file] [--strict]
 *   --to defaults to the latest month TranStats reports for the table.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORM = "https://www.transtats.bts.gov/DL_SelectFields.aspx?gnoyr_VQ=FMG&QO_fu146_anzr=Nv4%20Pn44vr45";
const FIELDS = ["YEAR", "MONTH", "UNIQUE_CARRIER", "ORIGIN", "DEST", "DEPARTURES_SCHEDULED", "DEPARTURES_PERFORMED", "SEATS", "PASSENGERS", "CLASS"];
/**
 * American and its wholly owned regionals. Capacity-purchase regionals that also fly for
 * other airlines (SkyWest OO, Republic YX) report T-100 under their own code across all
 * brands, so their rows can't be attributed to American and are excluded.
 */
export const AA_FAMILY = new Set(["AA", "MQ", "OH", "PT"]);
const MIN_ROUTES = 300;

export function splitCsv(line) {
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

/**
 * Aggregate one month's T-100 CSV text into per-route totals for the AA family.
 * Only scheduled passenger service (CLASS F) between known airports is kept.
 */
export function aggregateMonth(csv, airports, totals = new Map()) {
  const lines = csv.split(/\r?\n/);
  const header = splitCsv((lines[0] ?? "").replace(/^\uFEFF/, "")).map((h) => h.trim().replace(/"/g, "").toUpperCase());
  const ix = Object.fromEntries(FIELDS.map((f) => [f, header.indexOf(f)]));
  const missing = FIELDS.filter((f) => ix[f] < 0);
  if (missing.length) throw new Error(`T-100 CSV is missing columns: ${missing.join(", ")} (header starts: ${JSON.stringify((lines[0] ?? "").slice(0, 300))})`);
  let kept = 0;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const f = splitCsv(lines[i]);
    if (!AA_FAMILY.has(f[ix.UNIQUE_CARRIER])) continue;
    if (f[ix.CLASS] !== "F") continue;
    const o = f[ix.ORIGIN];
    const d = f[ix.DEST];
    if (!airports.has(o) || !airports.has(d)) continue;
    const seats = Number(f[ix.SEATS]);
    const pax = Number(f[ix.PASSENGERS]);
    const deps = Number(f[ix.DEPARTURES_PERFORMED]);
    if (!(seats > 0) || !(deps > 0) || !(pax >= 0)) continue; // missing or zero capacity rows
    const key = `${o}-${d}|${Number(f[ix.YEAR])}-${Number(f[ix.MONTH])}`;
    const t = totals.get(key) ?? { seats: 0, pax: 0, deps: 0 };
    t.seats += seats;
    t.pax += pax;
    t.deps += deps;
    totals.set(key, t);
    kept++;
  }
  return { totals, kept };
}

/** Turn aggregated totals into the compact output: route → month → [load factor %, departures, year]. */
export function toRoutes(totals, { minDepartures = 8 } = {}) {
  const routes = {};
  for (const [key, t] of totals) {
    const [route, ym] = key.split("|");
    const [y, m] = ym.split("-").map(Number);
    // Too few flights for a monthly average to mean much.
    if (t.deps < minDepartures) continue;
    const lf = Math.min(100, Math.round((t.pax / t.seats) * 1000) / 10);
    routes[route] ??= {};
    const prev = routes[route][m];
    if (!prev || y > prev[2]) routes[route][m] = [lf, t.deps, y];
  }
  return routes;
}

function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function getForm() {
  const res = await fetch(FORM);
  if (!res.ok) throw new Error(`T-100 form returned ${res.status}`);
  const html = await res.text();
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const val = (n) => (html.match(new RegExp(`id="${n}"[^>]*value="([^"]*)"`)) || html.match(new RegExp(`name="${n}"[^>]*value="([^"]*)"`)) || [])[1] ?? "";
  const latestLabel = (html.match(/Latest Available Data[^A-Za-z0-9]*([A-Za-z]+) (\d{4})/i) || []).slice(1);
  const latest = latestLabel.length ? `${latestLabel[1]}-${String(MONTHS.indexOf(latestLabel[0]) + 1).padStart(2, "0")}` : undefined;
  if (!html.includes('name="SEATS"')) throw new Error("T-100 form no longer offers the SEATS field");
  return { cookie, state: { __VIEWSTATE: val("__VIEWSTATE"), __VIEWSTATEGENERATOR: val("__VIEWSTATEGENERATOR"), __EVENTVALIDATION: val("__EVENTVALIDATION") }, latest };
}

async function downloadMonth(ym, dir) {
  const [y, m] = ym.split("-").map(Number);
  const { cookie, state } = await getForm();
  const body = new URLSearchParams({ __EVENTTARGET: "", __EVENTARGUMENT: "", __LASTFOCUS: "", ...state, cboGeography: "All", cboYear: String(y), cboPeriod: String(m), chkDownloadZip: "on", btnDownload: "Download" });
  for (const f of FIELDS) body.set(f, "on");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(FORM, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie, referer: FORM }, body });
    const buf = Buffer.from(await res.arrayBuffer());
    if (res.ok && buf.subarray(0, 2).toString() === "PK") {
      const zip = path.join(dir, `t100_${ym}.zip`);
      writeFileSync(zip, buf);
      // The zip may include a readme next to the data; read only the CSV member.
      const members = execFileSync("unzip", ["-Z1", zip]).toString().split("\n").filter(Boolean);
      const csvName = members.find((n) => n.toLowerCase().endsWith(".csv"));
      if (!csvName) throw new Error(`T-100 zip for ${ym} has no CSV (members: ${members.join(", ")})`);
      return execFileSync("unzip", ["-p", zip, csvName], { maxBuffer: 1024 * 1024 * 512 }).toString("utf8").replace(/^\uFEFF/, "");
    }
    console.log(`  ${ym}: attempt ${attempt} returned ${res.status} ${res.headers.get("content-type")}`);
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
  return undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (k) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const strict = argv.includes("--strict");
  const out = opt("out") ?? "public/data/aa-loads.json";
  const airportsSrc = readFileSync("src/lib/data/airports.ts", "utf8");
  const airports = new Set([...airportsSrc.matchAll(/code: "([A-Z]{3})"/g)].map((m) => m[1]));

  const { latest } = await getForm();
  // T-100 is usually fresher than the on-time file; use its own newest month unless told otherwise.
  const to = latest ?? opt("to");
  if (!to) throw new Error("Could not determine the latest T-100 month");
  const months = Array.from({ length: 12 }, (_, i) => addMonths(to, i - 11));
  console.log(`T-100 window ${months[0]}..${to} (TranStats reports latest ${latest ?? "unknown"})`);

  const dir = mkdtempSync(path.join(tmpdir(), "t100-"));
  const totals = new Map();
  const used = [];
  const failed = [];
  for (const ym of months) {
    const csv = await downloadMonth(ym, dir);
    if (!csv) {
      failed.push(ym);
      continue;
    }
    const { kept } = aggregateMonth(csv, airports, totals);
    console.log(`  ${ym}: ${csv.length} bytes, kept ${kept} AA-family rows`);
    if (kept === 0) failed.push(ym);
    else used.push(ym);
  }
  rmSync(dir, { recursive: true, force: true });

  if (strict && failed.length) {
    console.error(`Strict mode: T-100 months failed (${failed.join(", ")}). Not publishing.`);
    process.exit(1);
  }
  const routes = toRoutes(totals);
  const count = Object.keys(routes).length;
  if (count < MIN_ROUTES) {
    console.error(`Validation failed: only ${count} routes (minimum ${MIN_ROUTES}). Not publishing.`);
    process.exit(1);
  }
  let previous;
  try {
    previous = JSON.parse(readFileSync(out, "utf8"));
  } catch {
    previous = undefined;
  }
  const result = {
    meta: {
      source: "US DOT BTS T-100 Segment (All Carriers), scheduled passenger service (class F)",
      carriers: [...AA_FAMILY].join(", "),
      excluded: "SkyWest (OO), Republic (YX) and other regionals that fly for several airlines; their capacity can't be attributed to American.",
      months: used,
      failedMonths: failed,
      latestAvailable: latest ?? null,
      generatedAt: new Date().toISOString(),
      note: "Monthly passengers ÷ seats per nonstop segment. Historical average only — not current seat availability.",
    },
    routes,
  };
  if (previous && JSON.stringify(previous.routes) === JSON.stringify(routes) && JSON.stringify(previous.meta.months) === JSON.stringify(used)) {
    result.meta.generatedAt = previous.meta.generatedAt;
  }
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result));
  console.log(`Wrote ${out}: ${count} routes from ${used.length} months (${failed.length} failed).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
