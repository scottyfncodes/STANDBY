// Temporary probe: name each T-100 table and attempt one real download. Removed before merge.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const base = "https://www.transtats.bts.gov/DL_SelectFields.aspx";
async function page(id) {
  const res = await fetch(`${base}?gnoyr_VQ=${id}&QO_fu146_anzr=Nv4%20Pn44vr45`);
  const html = await res.text();
  return { html, cookie: res.headers.getSetCookie?.().map((c) => c.split(";")[0]).join("; ") ?? "" };
}
for (const id of ["GED", "GEE", "FJD", "FJE", "FMF", "FMG"]) {
  const { html } = await page(id);
  const names = [...html.matchAll(/T-100[^<"]{0,80}/g)].map((m) => m[0].trim());
  const geo = (html.match(/<select[^>]*cboGeography[^>]*>([\s\S]*?)<\/select>/i) || [])[1] || "";
  const firstGeo = [...geo.matchAll(/value="([^"]*)"/g)].map((x) => x[1]).slice(0, 3);
  console.log(`### ${id}: ${[...new Set(names)].slice(0, 4).join(" || ")} | geo first=${firstGeo.join("|")} | hasSeats=${/name="SEATS"/.test(html)}`);
}
const id = "FJE";
const { html, cookie } = await page(id);
const val = (n) => (html.match(new RegExp(`name="${n}"[^>]*value="([^"]*)"`)) || html.match(new RegExp(`id="${n}"[^>]*value="([^"]*)"`)) || [])[1] ?? "";
const form = new URLSearchParams({
  __EVENTTARGET: "", __EVENTARGUMENT: "", __LASTFOCUS: "",
  __VIEWSTATE: val("__VIEWSTATE"), __VIEWSTATEGENERATOR: val("__VIEWSTATEGENERATOR"), __EVENTVALIDATION: val("__EVENTVALIDATION"),
  cboGeography: "All", cboYear: "2026", cboPeriod: "5", chkDownloadZip: "on", btnDownload: "Download",
});
for (const f of ["YEAR", "MONTH", "UNIQUE_CARRIER", "ORIGIN", "DEST", "ORIGIN_COUNTRY", "DEST_COUNTRY", "DEPARTURES_SCHEDULED", "DEPARTURES_PERFORMED", "SEATS", "PASSENGERS", "CLASS"]) form.set(f, "on");
const res = await fetch(`${base}?gnoyr_VQ=${id}&QO_fu146_anzr=Nv4%20Pn44vr45`, {
  method: "POST", redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie, referer: `${base}?gnoyr_VQ=${id}` },
  body: form,
});
console.log("POST status", res.status, "type", res.headers.get("content-type"), "loc", res.headers.get("location"), "disp", res.headers.get("content-disposition"));
let buf = Buffer.from(await res.arrayBuffer());
let loc = res.headers.get("location");
if (loc) {
  const url = new URL(loc, base).toString();
  console.log("following", url);
  const r2 = await fetch(url);
  console.log("GET status", r2.status, r2.headers.get("content-type"));
  buf = Buffer.from(await r2.arrayBuffer());
}
console.log("bytes", buf.length, "magic", buf.subarray(0, 4).toString("hex"));
if (buf.subarray(0, 2).toString() === "PK") {
  writeFileSync("/tmp/t100.zip", buf);
  console.log(execFileSync("bash", ["-c", "unzip -l /tmp/t100.zip; unzip -p /tmp/t100.zip | head -5; echo rows: $(unzip -p /tmp/t100.zip | wc -l); unzip -p /tmp/t100.zip | grep -c '\"AA\"'"]).toString());
} else {
  console.log(buf.toString("utf8").replace(/\s+/g, " ").slice(0, 600));
}
