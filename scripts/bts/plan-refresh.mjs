#!/usr/bin/env node
/**
 * Decide which 12-month window the BTS refresh should build.
 *
 * - `--mode rebuild`: rebuild the window already in the dataset (for reviewing pipeline changes).
 * - `--mode latest`: probe BTS for newly published months after the dataset's last month and,
 *   if any exist, roll the window forward to the newest one.
 *
 * Prints GitHub Actions outputs (from, to, changed, latest, reason) on stdout.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function windowEnding(to) {
  return { from: addMonths(to, -11), to };
}

function existingEnd(file) {
  if (!existsSync(file)) return undefined;
  const months = JSON.parse(readFileSync(file, "utf8")).meta?.months ?? [];
  return months.map((m) => m.month).sort().at(-1);
}

async function published(ym) {
  const [y, m] = ym.split("-").map(Number);
  const url = `https://transtats.bts.gov/PREZIP/On_Time_Marketing_Carrier_On_Time_Performance_Beginning_January_2018_${y}_${m}.zip`;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Pure decision: given the dataset's last month and which later months BTS has published,
 * return the window to build (or why nothing changes).
 */
export function decide({ mode, end, current, publishedMonths, to, reachable = true }) {
  if (mode === "rebuild") {
    const last = to ?? end;
    if (!last) return { changed: false, reason: "No existing dataset to rebuild; run with mode=latest" };
    return { changed: true, ...windowEnding(last), latest: end ?? "none", reason: `Rebuilding ${windowEnding(last).from}..${last}` };
  }
  // Without this, an outage would look like "no new data yet".
  if (!reachable) return { changed: false, error: true, latest: end ?? "none", reason: "BTS could not be reached (even the already-published month failed)" };
  let latest = end;
  for (let ym = end ? addMonths(end, 1) : addMonths(current, -12); ym <= current; ym = addMonths(ym, 1)) {
    if (publishedMonths.has(ym)) latest = ym;
    else if (latest && ym > latest) break; // BTS publishes months in order
  }
  if (!latest) return { changed: false, error: true, latest: "none", reason: "BTS on-time files could not be reached" };
  if (latest === end) return { changed: false, latest, reason: `No new BTS month published after ${end}` };
  return { changed: true, ...windowEnding(latest), latest, reason: `New BTS data through ${latest}` };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith("--") ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
  const mode = args.mode ?? "latest";
  const now = new Date();
  const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const end = existingEnd(args.file ?? "public/data/aa-history.json");
  const publishedMonths = new Set();
  let reachable = true;
  if (mode !== "rebuild") {
    if (end) reachable = await published(end);
    for (let ym = end ? addMonths(end, 1) : addMonths(current, -12); ym <= current; ym = addMonths(ym, 1)) {
      if (await published(ym)) publishedMonths.add(ym);
      else if (publishedMonths.size || end) break;
    }
  }
  const d = decide({ mode, end, current, publishedMonths, to: args.to, reachable });
  for (const [k, v] of Object.entries(d)) console.log(`${k}=${v}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
